import pytest

from datanav.config import CURRENT_POINTER


def built_catalog_available() -> bool:
    return CURRENT_POINTER.exists()


requires_catalog = pytest.mark.skipif(
    not built_catalog_available(),
    reason="빌드된 카탈로그 없음 — scripts/build_catalog.py 먼저 실행",
)


@pytest.fixture(scope="session")
def service():
    from datanav.api.service import Service
    return Service()
