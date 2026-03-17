package org.app.cia;

import org.app.cia.analysis.ImpactAnalysisEngine;
import org.app.cia.analysis.ImpactReport;
import org.app.cia.db.CodeUnitNodeRepository;
import org.app.cia.db.GraphMapper;
import org.app.cia.diff.ASTDiffEngine;
import org.app.cia.diff.Change;
import org.app.cia.graph.DependencyGraph;
import org.app.cia.graph.Edge;
import org.app.cia.ingestion.GitManager;
import org.app.cia.parser.CodeUnit;
import org.app.cia.parser.DirScanner;
import org.app.cia.parser.Enums.Language;
import org.app.cia.parser.FileDispatcher;
import org.app.cia.registry.RegistryService;
import org.app.cia.registry.RepoRegistry;
import org.jgrapht.Graph;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class CoreService {

    @Value("${app.basepath}")
    private String basePath;

    private final CodeUnitNodeRepository repository;
    private final RegistryService registryService = new RegistryService();
    private final DirScanner dirScanner = new DirScanner();
    private final FileDispatcher fileDispatcher = new FileDispatcher();
    private final DependencyGraph dependencyGraph = new DependencyGraph();
    private final ASTDiffEngine astDiffEngine = new ASTDiffEngine();
    private final GraphMapper graphMapper = new GraphMapper();

    private List<CodeUnit> oldUnits;
    private List<CodeUnit> currentUnits;
    private Graph<CodeUnit, Edge> codeUnitGraph;
    private Graph<CodeUnit, Edge> oldCodeUnitGraph;
    private List<Change> changes;
    private ImpactReport impactReport;

    public CoreService(CodeUnitNodeRepository repository) {
        this.repository = repository;
    }

    public void extractAndBuild(String url) {
        RepoRegistry registry = registryService.getOrRegister(url, Paths.get(basePath));

        GitManager gitManager = new GitManager(url, Paths.get(basePath));
        List<String> changedFiles = gitManager.getChangedFiles(
                registry.getClonedPath(),
                registry.getCurrentHash(),
                registry.getPreviousHash()
        );

        Map<Language, List<Path>> currentFileMap = new HashMap<>();
        Map<Language, List<Path>> oldFileMap = new HashMap<>();

        for (String file : changedFiles) {
            if (file.contains("node_modules")) continue;

            Path currentPath = registry.getCurrentSnapshot().resolve(file);
            Path oldPath = registry.getPreviousSnapshot().resolve(file);

            boolean inCurrent = Files.exists(currentPath);
            boolean inOld = Files.exists(oldPath);

            Language lang = null;
            if (file.endsWith(".java")) lang = Language.JAVA;
            else if (file.endsWith(".js")) lang = Language.JS;
            if (lang == null) continue;

            if (inCurrent) currentFileMap.computeIfAbsent(lang, k -> new ArrayList<>()).add(currentPath);
            if (inOld) oldFileMap.computeIfAbsent(lang, k -> new ArrayList<>()).add(oldPath);
        }

        currentUnits = fileDispatcher.dispatch(currentFileMap);
        oldUnits = fileDispatcher.dispatch(oldFileMap);
    }

    public void buildGraph() {
        // Current graph — only changed files
        codeUnitGraph = dependencyGraph.buildGraph(currentUnits);

        // Old graph — full repo at previous commit for complete dependency traversal
        RepoRegistry registry = registryService.getLastRegistry();
        GitManager gm = new GitManager(registry.getClonedPath().getFileName().toString(), Paths.get(basePath));

        // Checkout old hash
        gm.checkoutHash(registry.getClonedPath(), registry.getPreviousHash());

        // Parse full repo at old state
        Map<Language, List<Path>> fullOldMap = dirScanner.traverse(List.of(registry.getClonedPath()));
        List<CodeUnit> fullOldUnits = fileDispatcher.dispatch(fullOldMap);
        oldCodeUnitGraph = dependencyGraph.buildGraph(fullOldUnits);

        // Checkout back to current hash
        gm.checkoutHash(registry.getClonedPath(), registry.getCurrentHash());
    }

    public void computeDiff() {
        changes = astDiffEngine.diff(oldUnits, currentUnits);
    }

    public void analyzeImpact() {
        ImpactAnalysisEngine engine = new ImpactAnalysisEngine();
        impactReport = engine.analyze(changes, codeUnitGraph, oldCodeUnitGraph, currentUnits);
    }

    public void persistGraph() {
        repository.saveAll(graphMapper.map(codeUnitGraph));
    }

    public ImpactReport getImpactReport() {
        return impactReport;
    }
}