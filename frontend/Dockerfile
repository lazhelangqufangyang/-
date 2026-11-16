# 构建阶段：Node 22 + Vite
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# 运行阶段：Nginx 静态站点
FROM nginx:1.27-alpine
ENV TZ=Asia/Shanghai

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
