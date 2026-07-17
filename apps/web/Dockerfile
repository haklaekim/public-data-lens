# 공공데이터 내비게이터 웹 (3층) — 프로덕션 빌드 + nginx 정적 서빙 + /api 리버스 프록시
FROM node:22-alpine AS build
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /web/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
