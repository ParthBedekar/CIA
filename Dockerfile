# ── Stage 1: Build the Spring Boot app ──────────────────────────────
FROM maven:3.9.6-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn clean package -DskipTests

# ── Stage 2: Run with Java + Node.js ────────────────────────────────
FROM eclipse-temurin:21-jre

# Install Node.js
RUN apt-get update && \
    apt-get install -y curl git && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built jar
COPY --from=build /app/target/*.jar app.jar

# Copy parser.js and install its npm dependencies
COPY --from=build /app/src/main/java/org/app/cia/parser/JSParser/parser.js ./parser.js
RUN npm install @babel/parser @babel/traverse

# Create base directory for repo cloning
RUN mkdir -p /tmp/cia

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]