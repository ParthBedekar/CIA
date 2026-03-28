package org.app.cia.api;

import org.app.cia.CoreService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api")
public class AnalysisController {

    private final CoreService coreService;

    public AnalysisController(CoreService coreService) {
        this.coreService = coreService;
    }

    @PostMapping("/analyze")
    public ResponseEntity<?> analyze(@RequestBody AnalysisRequest request) {
        try {
            coreService.extractAndBuild(request.getUrl());
            coreService.buildGraph();
            coreService.computeDiff();
            coreService.analyzeImpact();
            coreService.persistGraph();
            return ResponseEntity.ok(coreService.getImpactReport());
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }
}