# Rippler AST — Process-Oriented Change Impact Analyzer

> **Live Demo → [ripplerast.netlify.app](https://ripplerast.netlify.app/)**

Rippler AST is a process-oriented change impact analysis tool for large-scale Java and JavaScript codebases. Given a GitHub repository, it automatically detects what changed between the last two commits, builds a dependency graph, and traces which processes (folder-level modules) are affected — using AST parsing, graph traversal, and Neo4j persistence.

---

## Table of Contents

- [What It Does](#what-it-does)
- [Live Demo](#live-demo)
- [Architecture](#architecture)
- [Pipeline](#pipeline)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Key Components](#key-components)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [How Impact Is Computed](#how-impact-is-computed)
- [Requirements for Repos](#requirements-for-repos)
- [Performance Optimizations](#performance-optimizations)
- [Deployment](#deployment)

---

## What It Does

When a developer makes changes to a large codebase, understanding *what else breaks* is hard. Rippler AST solves this by:

1. **Cloning** the target repository and snapshotting the last 2 commits
2. **Parsing ASTs** of only the changed files (Java via JavaParser, JS via Babel)
3. **Building a dependency graph** — nodes are files (`CodeUnit`), edges are `CALLS`, `IMPORT`, `INHERITANCE`, `IMPLEMENTATION` relationships
4. **Diffing** the ASTs to extract element-level changes (methods, imports, classes added/removed)
5. **Running a reverse DFS** from each changed node to find all transitively dependent units
6. **Mapping affected units to processes** — each folder is treated as a process (e.g. `service/`, `controller/`, `repository/`)
7. **Persisting the graph** to Neo4j for structural querying
8. **Returning an `ImpactReport`** with raw changes, affected units, and affected process map

---

## Live Demo

**→ [https://ripplerast.netlify.app/](https://ripplerast.netlify.app/)**

Paste any public GitHub repo URL (must end in `.git`, must have 2+ commits with Java/JS changes) and hit **Run Analysis**.

**Example repos to try:**
```
https://github.com/ParthBedekar/CIA.git
https://github.com/spring-projects/spring-petclinic.git
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        REST API Layer                        │
│              POST /api/analyze  { url: string }              │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                        CoreService                           │
│  RegistryService → DirScanner → FileDispatcher → DiffEngine  │
│  DependencyGraph → ImpactAnalysisEngine → Neo4j Persistence  │
└─────────────────────────────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
┌─────────▼──────┐ ┌───────▼──────┐ ┌──────▼──────────┐
│  Ingestion     │ │  Parsing     │ │  Graph + Impact  │
│  GitManager    │ │  JavaParser  │ │  JGraphT         │
│  RegistryCache │ │  Babel/Node  │ │  Neo4j AuraDB    │
└────────────────┘ └──────────────┘ └─────────────────┘
```

---

## Pipeline

### Step 1 — Clone & Snapshot (with caching)

`RegistryService` maintains an in-memory registry of cloned repos. On first request, the repo is cloned and the last 2 commit hashes are retrieved via `git log`. Only the **changed files** between those commits are extracted using `git show <hash>:<file>` — no full directory copy.

On subsequent requests, `git pull` is run and hashes are compared. If unchanged, existing snapshots are reused instantly.

### Step 2 — Scan & Dispatch

`DirScanner.traverseChanged()` resolves only the changed file paths within each snapshot. `FileDispatcher` routes `.java` files to `JavaASTParser` and `.js` files to `JsASTParser`.

### Step 3 — AST Parsing

**Java** — `JavaASTParser` extends `VoidVisitorAdapter` from JavaParser and extracts:
- Class/interface declarations
- Method declarations
- Import declarations
- Method call expressions
- Inheritance and implementation relationships

**JavaScript** — `JsASTParser` spawns a Node.js child process running `parser.js` (Babel), which traverses the AST and returns a JSON payload with the same fields. Results are deserialized back into `CodeUnit` objects.

Each file becomes a `CodeUnit`:

```java
public class CodeUnit {
    String filename;
    Path filePath;
    Language language;         // JAVA | JS
    List<String> classes;
    List<String> methods;
    List<String> imports;
    List<String> methodCalls;
    List<ParentData> inheritance;
}
```

### Step 4 — Diff

`ASTDiffEngine` compares old and current `CodeUnit` lists:

- **File added** → `ADDITION` change for the entire file
- **File removed** → `REMOVAL` change for the entire file
- **File modified** → element-level diff via `compareList()` on methods, imports, classes, and method calls — producing individual `ADDITION` / `REMOVAL` changes per element

```java
public class Change {
    CodeUnit affectedCu;
    String oldParameter;
    String newParameter;
    ChangeType changeType;  // ADDITION | REMOVAL
}
```

### Step 5 — Dependency Graph

`DependencyGraph` builds a `DefaultDirectedGraph<CodeUnit, Edge>` using JGraphT:

| Edge Type | Meaning |
|-----------|---------|
| `CALLS` | File A calls a method defined in File B |
| `IMPORT` | File A imports File B |
| `INHERITANCE` | File A extends class in File B |
| `IMPLEMENTATION` | File A implements interface in File B |

Edges are directional — `A → B` means A depends on B.

### Step 6 — Impact Analysis (Reverse DFS)

`ImpactAnalysisEngine` wraps the graph in `EdgeReversedGraph` (JGraphT), then runs `DepthFirstIterator` from each changed `CodeUnit`. This traverses **upstream** — finding everything that depends on the changed node, transitively.

```
Changed: PaymentService.java
  ↑ CALLS   → PaymentController.java  (affected)
  ↑ IMPORT  → PaymentIntegrationTest.java  (affected)
              ↑ CALLS → TestRunner.java  (transitively affected)
```

### Step 7 — Process Mapping

`ProcessMapper` groups `CodeUnit`s by their parent directory name. Each directory = one process. The engine intersects affected units with the process map to produce `affectedProcessMap`:

```
{
  "service"    → [PaymentService.java, AuthService.java],
  "controller" → [PaymentController.java],
  "test"       → [PaymentIntegrationTest.java]
}
```

### Step 8 — Neo4j Persistence

`GraphMapper` converts the in-memory JGraphT graph into `CodeUnitNode` entities with `@Relationship` annotations. `CodeUnitNodeRepository` (Spring Data Neo4j) persists via `saveAll()`. The graph is stored in Neo4j AuraDB for structural querying.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Java 21, Spring Boot 4, Maven |
| Graph (in-memory) | JGraphT 1.5.2 |
| Graph (persistent) | Neo4j AuraDB Free, Spring Data Neo4j |
| Java AST | JavaParser 3.28 |
| JS AST | Babel Parser + Traverse (Node.js 20) |
| JSON | Jackson (com.fasterxml) |
| Utilities | Lombok, Apache Commons IO |
| Frontend | Vanilla HTML/CSS/JS |
| Backend hosting | Railway (Docker) |
| Frontend hosting | Netlify |
| DB hosting | Neo4j AuraDB Free |

---

## Project Structure

```
src/main/java/org/app/cia/
├── api/
│   ├── AnalysisController.java      # REST endpoint
│   └── AnalysisRequest.java         # Request DTO
├── analysis/
│   ├── ImpactAnalysisEngine.java    # Reverse DFS traversal
│   └── ImpactReport.java            # Result model
├── diff/
│   ├── ASTDiffEngine.java           # File + element-level diffing
│   ├── Change.java                  # Change model
│   └── Enums/ChangeType.java
├── graph/
│   ├── DependencyGraph.java         # JGraphT graph builder
│   ├── Edge.java                    # Typed edge
│   └── Enums/EdgeLabel.java
├── ingestion/
│   ├── GitManager.java              # git clone/pull/checkout/diff
│   └── IngestionService.java
├── parser/
│   ├── CodeUnit.java                # File model
│   ├── DirScanner.java              # File path resolution
│   ├── FileDispatcher.java          # Routes to correct parser
│   ├── JavaParser/JavaASTParser.java
│   └── JSParser/
│       ├── JsASTParser.java         # Spawns Node.js process
│       └── parser.js                # Babel AST traversal
├── process/
│   └── ProcessMapper.java           # Groups files by folder
├── registry/
│   ├── RegistryService.java         # Repo caching layer
│   └── RepoRegistry.java            # Cached repo state
├── db/
│   ├── CodeUnitNode.java            # Neo4j node entity
│   ├── CodeUnitNodeRepository.java  # Spring Data repo
│   └── GraphMapper.java             # JGraphT → Neo4j mapper
└── CoreService.java                 # Pipeline orchestrator
```

---

## Key Components

### `RegistryService` — Smart Caching

```java
public RepoRegistry getOrRegister(String url, Path base) {
    if (!repoRegistryMap.containsKey(url)) {
        // First time: clone, get hashes, extract only changed files
        Path repoPath = manager.cloneRepo();
        List<String> hashes = manager.getCommitHashes(repoPath);
        List<String> changedFiles = manager.getChangedFiles(repoPath, hashes.get(0), hashes.get(1));
        List<Path> snapshots = manager.createSnapshots(hashes, repoPath, changedFiles);
        repoRegistryMap.put(url, new RepoRegistry(...));
    } else {
        // Subsequent: pull, check if hashes changed, re-snapshot only if needed
        manager.pullRepo(repoPath);
        if (!newHash.equals(existing.getCurrentHash())) {
            // re-snapshot
        }
    }
}
```

### `ImpactAnalysisEngine` — Reverse DFS

```java
EdgeReversedGraph<CodeUnit, Edge> reversed = new EdgeReversedGraph<>(graph);

for (Change c : changeList) {
    if (graph.containsVertex(c.getAffectedCu())) {
        DepthFirstIterator<CodeUnit, Edge> dfi =
            new DepthFirstIterator<>(reversed, c.getAffectedCu());
        while (dfi.hasNext()) {
            affectedUnits.add(dfi.next());
        }
    }
}
```

### `GitManager` — Selective Snapshot

Instead of copying the entire repo, only changed files are extracted per commit:

```java
// git show <hash>:<filepath> → streams file content directly
ProcessBuilder pb = new ProcessBuilder("git", "show", hash + ":" + file);
Files.copy(process.getInputStream(), fileDest);
```

---

## Getting Started

### Prerequisites

- Java 21
- Maven 3.9+
- Node.js 20+ with `@babel/parser` and `@babel/traverse`
- Neo4j Desktop or AuraDB instance
- Git

### Local Setup

```bash
# Clone the repo
git clone https://github.com/ParthBedekar/CIA.git
cd CIA

# Install JS parser dependencies
cd src/main/java/org/app/cia/parser/JSParser
npm install @babel/parser @babel/traverse
cd -

# Configure application.properties
cat > src/main/resources/application.properties << EOF
spring.application.name=CIA
spring.neo4j.uri=bolt://localhost:7687
spring.neo4j.authentication.username=neo4j
spring.neo4j.authentication.password=yourpassword
spring.data.neo4j.database=yourdbname
app.basepath=/tmp/cia
EOF

# Run
mvn spring-boot:run
```

### Using the Frontend

Open `http://localhost:8080` in your browser, or use the hosted version at [ripplerast.netlify.app](https://ripplerast.netlify.app/).

---

## API Reference

### `POST /api/analyze`

Runs the full analysis pipeline on a repository.

**Request:**
```json
{
  "url": "https://github.com/user/repo.git"
}
```

**Response:**
```json
{
  "rawChanges": [
    {
      "oldParameter": "triggerEngine",
      "newParameter": "",
      "changeType": "REMOVAL"
    },
    {
      "oldParameter": "",
      "newParameter": "extractAndBuild",
      "changeType": "ADDITION"
    }
  ],
  "affectedProcessMap": {
    "service": [
      { "filename": "PaymentService.java", "language": "JAVA", ... }
    ],
    "controller": [
      { "filename": "PaymentController.java", "language": "JAVA", ... }
    ]
  }
}
```

---

## How Impact Is Computed

The core insight is **edge direction**. In the dependency graph, `A → B` means *A depends on B*. If B changes, A is the one that may break — not the other way around.

So impact propagation flows **against** edge direction. `EdgeReversedGraph` flips all edges, allowing a standard forward DFS to find all upstream dependents.

```
Graph edges (A depends on B):     Reversed (who depends on A):
  Controller → Service               Service ← Controller
  Service → Repository               Repository ← Service
  Test → Service                     Service ← Test

If Repository changes:
  Reverse DFS from Repository →
    finds Service (directly depends)
    finds Controller (transitively via Service)
    finds Test (transitively via Service)
```

---

## Requirements for Repos

| Requirement | Detail |
|-------------|--------|
| 2+ commits | The tool diffs the last 2 commits. Single-commit repos return empty results |
| Public HTTPS | Must be cloneable without credentials |
| `.git` URL | URL must end in `.git` |
| Java or JS files | Only `.java` and `.js` are parsed. Other languages are ignored |
| Folder structure | Folders define processes. Flat repos (all files in root) produce one process |

---

## Performance Optimizations

The initial prototype parsed every file in both snapshots on every request — taking 2+ minutes for small repos. The following optimizations brought this down to **~3.5 seconds** on the same codebase:

| Optimization | Impact |
|-------------|--------|
| `git diff --name-only` to find changed files | Only changed files are parsed, not the whole repo |
| `git show <hash>:<file>` for snapshot extraction | No full directory copy — only needed files extracted |
| `RegistryService` in-memory cache | Clone and snapshot skipped on repeat requests |
| Hash comparison before re-snapshotting | Unchanged repos skip all git operations after pull |

---

## Deployment

The project is deployed as a multi-stage Docker build on Railway, with Neo4j AuraDB Free as the cloud graph database and Netlify for the static frontend.

### Docker (Stage 1: Build, Stage 2: Run with Java + Node.js)

```dockerfile
FROM maven:3.9.6-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn clean package -DskipTests

FROM eclipse-temurin:21-jre
RUN apt-get update && apt-get install -y curl git nodejs npm
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
COPY --from=build /app/src/main/java/org/app/cia/parser/JSParser/parser.js ./parser.js
RUN npm install @babel/parser @babel/traverse
RUN mkdir -p /tmp/cia
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

### Environment Variables (Railway)

```
SPRING_NEO4J_URI=neo4j+s://xxxx.databases.neo4j.io
SPRING_NEO4J_USERNAME=neo4j
SPRING_NEO4J_PASSWORD=yourpassword
SPRING_NEO4J_DATABASE=yourdbname
```

---

## Future Work

- **Async processing** — return job ID immediately, poll for results
- **Registry persistence** — store registry in Neo4j to survive server restarts
- **Code snippet preview** — show actual changed code lines alongside element-level diffs
- **Multi-commit analysis** — diff across arbitrary commit ranges, not just last 2
- **Private repo support** — OAuth token injection for GitHub authentication
- **Python/TypeScript parsers** — extend language support beyond Java and JS

---

## Author

Built by **Parth Bedekar** as a prototype for process-oriented change impact analysis in large software systems.

**Live at → [https://ripplerast.netlify.app/](https://ripplerast.netlify.app/)**
