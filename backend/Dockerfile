# 构建阶段：Maven + JDK 17
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app

COPY settings.xml pom.xml ./
RUN mvn -s settings.xml -q -B -DskipTests dependency:resolve

COPY src ./src
RUN mvn -s settings.xml -q -B -DskipTests package

# 运行阶段：JRE 17 alpine
FROM eclipse-temurin:17-jre-alpine
ENV TZ=Asia/Shanghai
WORKDIR /app

COPY --from=build /app/target/fitplan-api.jar /app/app.jar

EXPOSE 8787
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
