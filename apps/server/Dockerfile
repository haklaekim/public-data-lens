# 공공데이터 내비게이터 API 서버 (2층 REST + 컨시어지)
# 카탈로그 데이터는 이미지에 넣지 않고 /app/data 볼륨으로 마운트한다(스냅샷 교체 시 재빌드 불필요).
FROM python:3.12-slim

ENV DATANAV_ROOT=/app \
    PYTHONUNBUFFERED=1

WORKDIR /app/apps/server

COPY pyproject.toml ./
COPY datanav ./datanav
COPY scripts ./scripts

# editable 설치: 패키지 내 데이터 파일(shapes/prompts/cases/spec)을 소스 경로 그대로 사용
RUN pip install --no-cache-dir -e .

EXPOSE 8000

# 다중 워커 금지: rate limit·사용량 캡이 프로세스 메모리/단일 파일 전제(스케일아웃은 게이트웨이 계층에서)
CMD ["uvicorn", "datanav.api.rest:app", "--host", "0.0.0.0", "--port", "8000"]
