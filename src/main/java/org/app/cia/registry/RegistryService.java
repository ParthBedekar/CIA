package org.app.cia.registry;

import org.app.cia.ingestion.GitManager;

import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class RegistryService {
    private Map<String, RepoRegistry> repoRegistryMap;
    private GitManager manager;
    private RepoRegistry lastRegistry;

    public RegistryService() {
        repoRegistryMap = new HashMap<>();
    }

    public RepoRegistry getOrRegister(String url, Path base) {
        if (!repoRegistryMap.containsKey(url)) {
            manager = new GitManager(url, base);
            Path repoPath = manager.cloneRepo();
            List<String> hashes = manager.getCommitHashes(repoPath);
            List<String> changedFiles = manager.getChangedFiles(repoPath, hashes.get(0), hashes.get(1));
            List<Path> snapshots = manager.createSnapshots(hashes, repoPath, changedFiles);
            repoRegistryMap.put(url, new RepoRegistry(repoPath, snapshots.get(0), snapshots.get(1), hashes.get(0), hashes.get(1), changedFiles));
        } else {
            manager = new GitManager(url, base);
            Path repoPath = repoRegistryMap.get(url).getClonedPath();
            manager.pullRepo(repoPath);
            List<String> hashes = manager.getCommitHashes(repoPath);
            RepoRegistry existing = repoRegistryMap.get(url);
            if (!hashes.get(0).equals(existing.getCurrentHash())) {
                List<String> changedFiles = manager.getChangedFiles(repoPath, hashes.get(0), hashes.get(1));
                List<Path> snapshots = manager.createSnapshots(hashes, repoPath, changedFiles);
                repoRegistryMap.put(url, new RepoRegistry(repoPath, snapshots.get(0), snapshots.get(1), hashes.get(0), hashes.get(1), changedFiles));
            }
        }
        lastRegistry = repoRegistryMap.get(url);
        return lastRegistry;
    }

    public RepoRegistry getLastRegistry() {
        return lastRegistry;
    }
}