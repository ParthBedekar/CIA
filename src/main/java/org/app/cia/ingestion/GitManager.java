package org.app.cia.ingestion;

import org.apache.commons.io.FileUtils;
import org.app.cia.ingestion.Exceptions.GitOperationException;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

public class GitManager {
    private final String repoUrl;
    private final Path baseDirectory;

    public GitManager(String url, Path base) {
        this.repoUrl = url;
        this.baseDirectory = base;
    }

    /**
     * Returns the name of the currently checked-out branch in the given repo directory.
     * Uses `git branch --show-current` which works on Git 2.22+.
     */
    private String getCurrentBranch(Path repoDirectory) {
        // Strategy 1: git branch --show-current (Git 2.22+)
        try {
            ProcessBuilder pb = new ProcessBuilder("git", "branch", "--show-current");
            pb.directory(repoDirectory.toFile());
            Process process = pb.start();
            BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
            String branch = reader.readLine();
            process.waitFor();
            if (branch != null && !branch.isBlank()) {
                return branch.trim();
            }
        } catch (Exception e) { /* fall through */ }

        // Strategy 2: parse `git branch` for the '*' line
        // Note: detached HEAD shows as "* (HEAD detached at <hash>)" — skip those
        try {
            ProcessBuilder pb = new ProcessBuilder("git", "branch");
            pb.directory(repoDirectory.toFile());
            Process process = pb.start();
            BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("*")) {
                    String candidate = line.substring(1).trim();
                    if (!candidate.startsWith("(HEAD detached")) {
                        process.waitFor();
                        return candidate;
                    }
                }
            }
            process.waitFor();
        } catch (Exception e) { /* fall through */ }

        // Strategy 3: ask git which remote branches exist and pick the default
        // (handles freshly-cloned repos that land in detached HEAD)
        try {
            ProcessBuilder pb = new ProcessBuilder("git", "remote", "show", "origin");
            pb.directory(repoDirectory.toFile());
            Process process = pb.start();
            BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
            String line;
            while ((line = reader.readLine()) != null) {
                line = line.trim();
                if (line.startsWith("HEAD branch:")) {
                    String branch = line.replace("HEAD branch:", "").trim();
                    process.waitFor();
                    return branch;
                }
            }
            process.waitFor();
        } catch (Exception e) { /* fall through */ }

        // Strategy 4: last resort — try common branch names in order
        for (String candidate : List.of("main", "master", "develop", "dev")) {
            ProcessBuilder pb = new ProcessBuilder("git", "checkout", candidate);
            pb.directory(repoDirectory.toFile());
            pb.redirectOutput(ProcessBuilder.Redirect.DISCARD);
            pb.redirectError(ProcessBuilder.Redirect.DISCARD);
            try {
                int exit = pb.start().waitFor();
                if (exit == 0) return candidate;
            } catch (Exception e) { /* try next */ }
        }

        throw new GitOperationException("Could not detect current branch for: " + repoUrl);
    }

    public void checkoutHash(Path clonedPath, String hash) {
        ProcessBuilder checkout = new ProcessBuilder("git", "checkout", hash);
        checkout.directory(clonedPath.toFile());
        checkout.redirectOutput(ProcessBuilder.Redirect.DISCARD);
        checkout.redirectError(ProcessBuilder.Redirect.DISCARD);
        try {
            checkout.start().waitFor();
        } catch (Exception e) {
            throw new GitOperationException("Failed to checkout hash: " + hash);
        }
    }

    public void pullRepo(Path clonedPath) {
        // Step 1: fetch so local refs are up to date — works even in detached HEAD
        runSilently(clonedPath, "git", "fetch", "origin");

        // Step 2: resolve the remote default branch without relying on local HEAD state
        String branch = getRemoteDefaultBranch(clonedPath);

        // Step 3: force checkout onto that branch, re-attaching HEAD if currently detached.
        // -B creates or resets the local branch to track origin/<branch>.
        runSilently(clonedPath, "git", "checkout", "-B", branch, "origin/" + branch);

        // Step 4: pull (will be a fast-forward since we're already at origin/<branch>)
        ProcessBuilder puller = new ProcessBuilder("git", "pull", "origin", branch);
        puller.directory(clonedPath.toFile());
        puller.redirectOutput(ProcessBuilder.Redirect.DISCARD);
        puller.redirectError(ProcessBuilder.Redirect.DISCARD);
        Process pullProcess;
        try {
            pullProcess = puller.start();
        } catch (IOException e) {
            throw new GitOperationException("Failed to pull repository: " + repoUrl);
        }
        int exitCode;
        try {
            exitCode = pullProcess.waitFor();
        } catch (InterruptedException e) {
            throw new GitOperationException("Pull process interrupted for: " + repoUrl);
        }
        if (exitCode != 0) {
            throw new GitOperationException("Failed to pull repository: " + repoUrl);
        }
    }

    /**
     * Reads the remote default branch from origin's symbolic ref — works regardless
     * of local HEAD state (detached or not). Falls back to getCurrentBranch.
     */
    private String getRemoteDefaultBranch(Path repoDirectory) {
        // First: git symbolic-ref refs/remotes/origin/HEAD (set automatically on clone)
        try {
            ProcessBuilder pb = new ProcessBuilder(
                    "git", "symbolic-ref", "--short", "refs/remotes/origin/HEAD");
            pb.directory(repoDirectory.toFile());
            Process process = pb.start();
            BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
            String line = reader.readLine();
            process.waitFor();
            // Returns "origin/main" — strip prefix
            if (line != null && !line.isBlank()) {
                return line.trim().replaceFirst("^origin/", "");
            }
        } catch (Exception e) { /* fall through */ }

        // Second: set the remote HEAD ourselves then retry (handles Railway containers
        // where the symbolic-ref wasn't written during clone)
        try {
            runSilently(repoDirectory, "git", "remote", "set-head", "origin", "--auto");
            ProcessBuilder pb = new ProcessBuilder(
                    "git", "symbolic-ref", "--short", "refs/remotes/origin/HEAD");
            pb.directory(repoDirectory.toFile());
            Process process = pb.start();
            BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
            String line = reader.readLine();
            process.waitFor();
            if (line != null && !line.isBlank()) {
                return line.trim().replaceFirst("^origin/", "");
            }
        } catch (Exception e) { /* fall through */ }

        // Last resort: fall back to local branch detection
        return getCurrentBranch(repoDirectory);
    }

    /**
     * Runs a git command silently, discarding all output. Failures are ignored —
     * only use this for preparatory steps where partial success is acceptable.
     */
    private void runSilently(Path directory, String... command) {
        ProcessBuilder pb = new ProcessBuilder(command);
        pb.directory(directory.toFile());
        pb.redirectOutput(ProcessBuilder.Redirect.DISCARD);
        pb.redirectError(ProcessBuilder.Redirect.DISCARD);
        try {
            pb.start().waitFor();
        } catch (Exception e) { /* intentionally silent */ }
    }

    public List<String> getChangedFiles(Path clonedPath, String hash1, String hash2) {
        ProcessBuilder pb = new ProcessBuilder("git", "diff", "--name-only", hash1, hash2);
        pb.directory(clonedPath.toFile());
        Process process;
        try {
            process = pb.start();
        } catch (IOException e) {
            throw new GitOperationException("Failed to get changed files for: " + repoUrl);
        }
        BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
        List<String> changedFiles = new ArrayList<>();
        String line;
        while (true) {
            try {
                line = reader.readLine();
                if (line == null) break;
                changedFiles.add(line);
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
        }
        try {
            process.waitFor();
        } catch (InterruptedException e) {
            throw new GitOperationException("Failed to get changed files for: " + repoUrl);
        }
        return changedFiles;
    }

    public Path cloneRepo() {
        int idx = repoUrl.lastIndexOf("/");
        String folderName = repoUrl.substring(idx + 1, repoUrl.lastIndexOf(".git"));
        Path cloneDest = Paths.get(baseDirectory.toString(), folderName);
        if (cloneDest.toFile().exists()) {
            return cloneDest;
        }
        ProcessBuilder cloner = new ProcessBuilder("git", "clone", repoUrl, cloneDest.toString());
        cloner.redirectOutput(ProcessBuilder.Redirect.DISCARD);
        cloner.redirectError(ProcessBuilder.Redirect.DISCARD);
        Process clonerProcess;
        try {
            clonerProcess = cloner.start();
        } catch (IOException e) {
            throw new GitOperationException("Failed to Clone Repository: " + repoUrl);
        }
        int exitCode;
        try {
            exitCode = clonerProcess.waitFor();
        } catch (InterruptedException e) {
            throw new GitOperationException("Cloning Process for " + repoUrl + " Interrupted");
        }
        if (exitCode != 0) {
            throw new GitOperationException("Failed to clone repository: repoUrl exited with code " + exitCode);
        }
        return cloneDest;
    }

    public List<String> getCommitHashes(Path repoDirectory) {
        String branch = getCurrentBranch(repoDirectory);

        // Ensure we're on the detected branch before reading its log
        ProcessBuilder checkout = new ProcessBuilder("git", "checkout", branch);
        checkout.directory(repoDirectory.toFile());
        checkout.redirectOutput(ProcessBuilder.Redirect.DISCARD);
        checkout.redirectError(ProcessBuilder.Redirect.DISCARD);
        try {
            checkout.start().waitFor();
        } catch (Exception e) { /* ignore */ }

        ProcessBuilder cd = new ProcessBuilder("git", "log", "--format=%H", "-n", "2");
        cd.directory(repoDirectory.toFile());
        Process hashProcess;
        try {
            hashProcess = cd.start();
        } catch (IOException e) {
            throw new GitOperationException("Failed to obtain Commit Hashes For: " + repoUrl);
        }

        BufferedReader reader = new BufferedReader(new InputStreamReader(hashProcess.getInputStream()));
        String line;
        List<String> commitHashes = new ArrayList<>();
        while (true) {
            try {
                line = reader.readLine();
                if (line == null) break;
                commitHashes.add(line);
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
        }

        int exitCode;
        try {
            exitCode = hashProcess.waitFor();
        } catch (InterruptedException e) {
            throw new GitOperationException("Failed to obtain Commit Hashes For: " + repoUrl);
        }
        if (exitCode != 0) {
            throw new GitOperationException("Failed to obtain Commit Hashes For: " + repoUrl);
        }
        return commitHashes;
    }

    public List<Path> createSnapshots(List<String> commitHashes, Path clonedPath, List<String> changedFiles) {
        List<Path> result = new ArrayList<>();
        for (String hash : commitHashes) {
            Path dest = Paths.get(baseDirectory.toString(), ("snapshot-" + hash));
            result.add(dest);
            if (dest.toFile().exists()) continue;
            dest.toFile().mkdirs();
            for (String file : changedFiles) {
                ProcessBuilder pb = new ProcessBuilder("git", "show", hash + ":" + file);
                pb.directory(clonedPath.toFile());
                Process process;
                try {
                    process = pb.start();
                } catch (IOException e) {
                    throw new GitOperationException("Failed to extract file: " + file);
                }
                Path fileDest = dest.resolve(file);
                fileDest.getParent().toFile().mkdirs();
                try {
                    java.nio.file.Files.copy(process.getInputStream(), fileDest, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                    process.waitFor();
                } catch (Exception e) {
                    throw new GitOperationException("Failed to write file: " + file);
                }
            }
        }
        return result;
    }
}