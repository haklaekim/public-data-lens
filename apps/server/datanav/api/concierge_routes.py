"""M3 생성형 컨시어지 REST 라우트(§9 3층) — 별도 서비스(B 스택) 전용 표면.

rest.py가 이 모듈을 조건부로 import해 등록한다 — 공개 스냅샷(컨시어지 미포함 배포)에서는
이 파일과 concierge.py가 함께 제거되며, 코어 REST·MCP는 코드 수정 없이 그대로 동작한다.
배포 분리: MCP·코어 웹 배포(A)는 DATANAV_CONCIERGE_ENABLED=0으로 이 표면을 끄고,
생성형 컨시어지는 별도 서비스(B)로만 노출한다. 계약상 컨시어지는 웹 REST 전용이다.
"""
from __future__ import annotations

import json
import os

from fastapi import FastAPI, Request
from pydantic import BaseModel

from .errors import DatanavError

CONCIERGE_ENABLED = os.environ.get("DATANAV_CONCIERGE_ENABLED", "1") == "1"


def _require_concierge() -> None:
    if not CONCIERGE_ENABLED:
        from .concierge import ConciergeUnavailable
        raise ConciergeUnavailable(
            "이 배포에는 생성형 컨시어지가 포함되지 않습니다 — 별도 컨시어지 서비스를 이용하세요. 검색·비교 등 비생성형 기능은 정상 동작합니다."
        )


class ConciergeAsk(BaseModel):
    question: str
    sessionId: str = "anonymous"


def register(app: FastAPI, client_key) -> None:
    """컨시어지 라우트 3종을 app에 등록한다. client_key는 rest의 익명 식별자 함수."""

    @app.get("/api/concierge/status")
    def concierge_status():
        from .concierge import MODEL, PROMPT_VERSION, UsageStore
        has_key = bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))
        enabled = CONCIERGE_ENABLED and has_key
        if not CONCIERGE_ENABLED:
            note = "이 배포에는 생성형 컨시어지가 포함되지 않습니다(별도 서비스) — 비생성형 기능은 정상"
        elif not has_key:
            note = "ANTHROPIC_API_KEY 미설정 — 생성형 컨시어지 비활성(비생성형 기능은 정상)"
        else:
            note = None
        return {
            "enabled": enabled,
            "model": MODEL,
            "promptVersion": PROMPT_VERSION,
            "usage": UsageStore().snapshot(),
            "note": note,
        }

    @app.post("/api/concierge")
    def concierge_ask(body: ConciergeAsk, request: Request):
        from .concierge import run_concierge
        _require_concierge()
        return run_concierge(body.question, body.sessionId, client_key=client_key(request))

    @app.post("/api/concierge/stream")
    def concierge_stream(body: ConciergeAsk, request: Request):
        """진행 스트리밍(SSE): 단계·Tool 이벤트를 발생 즉시 중계하고 마지막에 result/error 이벤트로 종료."""
        import queue
        import threading

        from fastapi.responses import StreamingResponse

        from .concierge import run_concierge

        _require_concierge()

        q: queue.Queue = queue.Queue()
        ckey = client_key(request)

        def work():
            try:
                result = run_concierge(body.question, body.sessionId, on_event=q.put, client_key=ckey)
                q.put({"type": "result", **result})
            except DatanavError as e:
                q.put({"type": "error", "error": e.to_dict(None)["error"]})
            except Exception:  # noqa: BLE001 — 스트림은 반드시 종료 이벤트로 닫는다
                # 예외 원문은 공개 클라이언트에 내보내지 않는다(컨테이너 경로 등 내부 정보 누수 방지)
                q.put({"type": "error", "error": {"code": "INTERNAL_ERROR",
                                                  "message": "내부 오류가 발생했습니다. 잠시 후 다시 시도하세요.",
                                                  "details": {}, "sourceSnapshot": None}})
            finally:
                q.put(None)

        threading.Thread(target=work, daemon=True).start()

        def gen():
            while True:
                ev = q.get()
                if ev is None:
                    break
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"

        return StreamingResponse(
            gen(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
