# 공공데이터 내비게이터 웹 (3층) — 프로덕션 빌드 + nginx 정적 서빙 + /api 리버스 프록시
FROM node:22-alpine AS build
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# 배포 표면: all(로컬 기본) | core(MCP 배포 동반 — 컨시어지 없음) | concierge(별도 컨시어지 서비스)
ARG VITE_SURFACE=all
ENV VITE_SURFACE=$VITE_SURFACE
RUN npm run build

FROM nginx:alpine
COPY --from=build /web/dist /usr/share/nginx/html
# 스택별 프록시 구성: 기본(nginx.conf)은 /api+/mcp+정본 프록시, 컨시어지 스택은 nginx.concierge.conf
ARG NGINX_CONF=nginx.conf
COPY ${NGINX_CONF} /etc/nginx/conf.d/default.conf
EXPOSE 80
