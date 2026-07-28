# 공개 게이트웨이(MCP 전용 배포) — 리버스 프록시 + 랜딩 한 장.
# nginx 공식 이미지의 envsubst 템플릿 기능으로 GATEWAY_REAL_IP_FROM을 주입한다.
FROM nginx:alpine
COPY default.conf.template /etc/nginx/templates/default.conf.template
COPY index.html /usr/share/nginx/html/index.html
ENV GATEWAY_REAL_IP_FROM=127.0.0.1
EXPOSE 80
