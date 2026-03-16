package org.app.cia.api;

import org.app.cia.CoreService;
import org.app.cia.analysis.ImpactReport;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Paths;

@RestController
@RequestMapping("/api")
public class AnalysisController {

    private final CoreService coreService;

    public AnalysisController(CoreService coreService) {
        this.coreService = coreService;
    }

    @PostMapping("/analyze")
    public ImpactReport analyze(@RequestBody AnalysisRequest request) {
        coreService.extractAndBuild(request.getUrl());
        coreService.buildGraph();
        coreService.computeDiff();
        coreService.analyzeImpact();
        coreService.persistGraph();
        return coreService.getImpactReport();
    }
}