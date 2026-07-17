"""3층 웹용 REST API — MCP와 동일한 Service를 사용(판단 로직 이중화 금지, §2).

보안(§10): rate limit, CORS, 입력 제한. 인증 없는 공개 읽기 전용 API.
"""
from __future__ import annotations

import json
import os
import time
from collections import defaultdict, deque

from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse

from ..config import CURRENT_POINTER
from ..pipeline.jsonld import JSONLD_CONTEXT
from ..rules import load_registry
from .errors import HTTP_STATUS, DatanavError, RateLimited
from .mcp_server import _SHAPES_PATH, _PROMPTS_DIR
from .service import Service

# 운영 배포 시 환경변수로 제한: DATANAV_CORS_ORIGINS="https://datanav.example" (쉼표 구분)
# 로컬 기본값은 개발 편의를 위한 전체 허용이며, 다중 프로세스 환경에서는
# 프로세스 메모리 기반 rate limit 대신 프록시/게이트웨이 계층 제한을 병행해야 한다.
RATE_LIMIT_PER_MIN = int(os.environ.get("DATANAV_RATE_LIMIT_PER_MIN", "120"))
CORS_ORIGINS = [
    o.strip() for o in os.environ.get("DATANAV_CORS_ORIGINS", "*").split(",") if o.strip()
]

app = FastAPI(title="공공데이터 내비게이터 API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET"],
    allow_headers=["*"],
)

_service: Service | None = None
_service_release: str | None = None
_hits: dict[str, deque] = defaultdict(deque)


def _svc() -> Service:
    global _service, _service_release
    ptr_release = None
    if CURRENT_POINTER.exists():
        ptr_release = json.loads(CURRENT_POINTER.read_text(encoding="utf-8"))["release"]
    if _service is None or ptr_release != _service_release:
        _service = Service()
        _service_release = _service.release
    return _service


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    q = _hits[ip]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= RATE_LIMIT_PER_MIN:
        err = RateLimited("요청 한도를 초과했습니다 — 잠시 후 다시 시도하세요",
                          {"limitPerMinute": RATE_LIMIT_PER_MIN})
        return JSONResponse(err.to_dict(), status_code=429)
    q.append(now)
    return await call_next(request)


@app.exception_handler(DatanavError)
async def datanav_error_handler(request: Request, exc: DatanavError):
    snapshot = _service.snapshot if _service else None
    return JSONResponse(exc.to_dict(snapshot), status_code=HTTP_STATUS[exc.code])


@app.get("/api/status")
def status():
    return _svc().get_status()


@app.get("/api/search")
def search(
    query: str | None = None,
    theme: str | None = None,
    org: str | None = None,
    format: str | None = None,
    updateCycle: str | None = None,
    license: str | None = None,
    listType: str | None = None,
    region: str | None = None,
    includeInferred: bool = True,
    updatedAfter: str | None = None,
    cursor: str | None = None,
    pageSize: int = Query(default=20, ge=1, le=100),
):
    return _svc().search_datasets(
        query=query, theme=theme, org=org, fmt=format, update_cycle=updateCycle,
        license_code=license, list_type=listType, region=region,
        include_inferred=includeInferred, updated_after=updatedAfter,
        cursor=cursor, page_size=pageSize,
    )


@app.get("/api/datasets/{record_id}")
def dataset(record_id: str, view: str = "card"):
    return _svc().get_dataset(record_id, view)


@app.get("/api/compare")
def compare(ids: str):
    record_ids = [i.strip() for i in ids.split(",") if i.strip()]
    return _svc().compare_datasets(record_ids)


@app.get("/api/changes")
def changes(
    status: str | None = None,
    cursor: str | None = None,
    pageSize: int = Query(default=20, ge=1, le=100),
):
    return _svc().get_catalog_changes(status, cursor, pageSize)


@app.get("/api/stats")
def stats(axis: str, limit: int = 30):
    return _svc().get_catalog_stats(axis, limit)


# 공개 Resource의 HTTP 사본(정본 경로는 §7 — 배포 시 리버스 프록시로 연결)
@app.get("/api/resources/rules")
def resource_rules():
    return load_registry()


@app.get("/api/resources/context")
def resource_context():
    return {"@context": JSONLD_CONTEXT}


@app.get("/api/resources/shapes", response_class=PlainTextResponse)
def resource_shapes():
    return _SHAPES_PATH.read_text(encoding="utf-8")


@app.get("/api/resources/prompts/build-data-plan", response_class=PlainTextResponse)
def resource_prompt():
    return (_PROMPTS_DIR / "build-data-plan-v1.0.md").read_text(encoding="utf-8")
