package org.app.cia;

import org.app.cia.analysis.ImpactAnalysisEngine;
import org.app.cia.analysis.ImpactReport;
import org.app.cia.db.CodeUnitNodeRepository;
import org.app.cia.db.GraphMapper;
import org.app.cia.diff.ASTDiffEngine;
import org.app.cia.diff.Change;
import org.app.cia.graph.DependencyGraph;
import org.app.cia.graph.Edge;
import org.app.cia.parser.CodeUnit;
import org.app.cia.parser.DirScanner;
import org.app.cia.parser.Enums.Language;
import org.app.cia.parser.FileDispatcher;
import org.app.cia.process.ProcessMapper;
import org.app.cia.registry.RegistryService;
import org.app.cia.registry.RepoRegistry;
import org.jgrapht.Graph;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.nio.file.Paths;
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
    private List<Change> changes;
    private ImpactReport impactReport;

    public CoreService(CodeUnitNodeRepository repository) {
        this.repository = repository;
    }

    public void extractAndBuild(String url) {
        RepoRegistry registry = registryService.getOrRegister(url, Paths.get(basePath));

        Map<Language, List<Path>> currentFileMap = dirScanner.traverseChanged(registry.getCurrentSnapshot(), registry.getChangedFiles());
        Map<Language, List<Path>> oldFileMap = dirScanner.traverseChanged(registry.getPreviousSnapshot(), registry.getChangedFiles());

        currentUnits = fileDispatcher.dispatch(currentFileMap);
        oldUnits = fileDispatcher.dispatch(oldFileMap);
    }
    public void buildGraph() {
        codeUnitGraph = dependencyGraph.buildGraph(currentUnits);
    }

    public void computeDiff() {
        changes = astDiffEngine.diff(oldUnits, currentUnits);
    }

    public void analyzeImpact() {
        ProcessMapper processMapper = new ProcessMapper();
        ImpactAnalysisEngine engine = new ImpactAnalysisEngine();
        impactReport = engine.analyze(changes, codeUnitGraph);
    }

    public void persistGraph() {
        repository.saveAll(graphMapper.map(codeUnitGraph));
    }

    public ImpactReport getImpactReport() {
        return impactReport;
    }
}