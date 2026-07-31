# 공개 게이트웨이(A 스택) — 리버스 프록시(랜딩은 코어 웹이 담당).
# nginx 공식 이미지의 envsubst 템플릿 기능으로 GATEWAY_REAL_IP_FROM을 주입한다.
FROM nginx:alpine
COPY default.conf.template /etc/nginx/templates/default.conf.template
ENV GATEWAY_REAL_IP_FROM=127.0.0.1
EXPOSE 80
