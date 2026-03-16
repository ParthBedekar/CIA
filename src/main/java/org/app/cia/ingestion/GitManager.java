package org.app.cia.ingestion;

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

    public GitManager(String url,Path base){
        this.repoUrl=url;
        this.baseDirectory=base;
    }
    public void pullRepo(Path clonedPath){
        ProcessBuilder puller = new ProcessBuilder("git", "pull");
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
        if(exitCode != 0){
            throw new GitOperationException("Failed to pull repository: " + repoUrl);
        }
    }
    public List<String> getChangedFiles(Path clonedPath, String hash1, String hash2){
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
        while(true){
            try {
                line = reader.readLine();
                if(line == null) break;
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

    public Path cloneRepo(){

        int idx = repoUrl.lastIndexOf("/");
        String folderName = repoUrl.substring(idx + 1, repoUrl.lastIndexOf(".git"));
        Path cloneDest = Paths.get(baseDirectory.toString(), folderName);
        if(cloneDest.toFile().exists()){
            return cloneDest;
        }
        ProcessBuilder cloner = new ProcessBuilder("git", "clone", repoUrl, cloneDest.toString());
        cloner.redirectOutput(ProcessBuilder.Redirect.DISCARD);
        cloner.redirectError(ProcessBuilder.Redirect.DISCARD);
        Process clonerProcess;
        try {
            clonerProcess=cloner.start();
        } catch (IOException e) {
            throw new GitOperationException("Failed to Clone Repository: " + repoUrl);
        }
        int exitCode;

        try {
            exitCode=clonerProcess.waitFor();
        } catch (InterruptedException e) {
            throw new GitOperationException("Cloning Process for "+repoUrl +" Interrupted");
        }
        if(exitCode!=0){
            throw new GitOperationException("Failed to clone repository: repoUrl exited with code "+exitCode);
        }


        return cloneDest;

    }

    public List<String> getCommitHashes(Path repoDirectory){
        // Try main first, then master
        ProcessBuilder resetMain = new ProcessBuilder("git", "checkout", "master");
        resetMain.directory(repoDirectory.toFile());
        resetMain.redirectOutput(ProcessBuilder.Redirect.DISCARD);
        resetMain.redirectError(ProcessBuilder.Redirect.DISCARD);
        try {
            int exitCode = resetMain.start().waitFor();
            if(exitCode != 0){
                ProcessBuilder resetMaster = new ProcessBuilder("git", "checkout", "main");
                resetMaster.directory(repoDirectory.toFile());
                resetMaster.redirectOutput(ProcessBuilder.Redirect.DISCARD);
                resetMaster.redirectError(ProcessBuilder.Redirect.DISCARD);
                resetMaster.start().waitFor();
            }
        } catch (Exception e) { /* ignore */ }

        ProcessBuilder cd = new ProcessBuilder("git","log","--format=%H","-n","2");
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
        while(true){
            try {
                line = reader.readLine();
                if(line == null) break;
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
        if(exitCode != 0){
            throw new GitOperationException("Failed to obtain Commit Hashes For: " + repoUrl);
        }

        return commitHashes;
    }

    public List<Path> createSnapshots(List<String> commitHashes, Path clonedPath, List<String> changedFiles){
        List<Path> result = new ArrayList<>();
        for(String hash : commitHashes){
            Path dest = Paths.get(baseDirectory.toString(), ("snapshot-" + hash));
            result.add(dest);
            if(dest.toFile().exists()) continue;
            dest.toFile().mkdirs();
            for(String file : changedFiles){
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
