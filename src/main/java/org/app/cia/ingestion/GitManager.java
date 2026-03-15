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

    public GitManager(String url,Path base){
        this.repoUrl=url;
        this.baseDirectory=base;
    }

    public Path cloneRepo(){

        String path=baseDirectory.toString();

        ProcessBuilder cloner=new ProcessBuilder("git","clone",repoUrl,path);
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
        int idx=repoUrl.lastIndexOf("/");
        String folderName=repoUrl.substring(idx+1,repoUrl.lastIndexOf(".git"));

        return Paths.get(path,folderName);

    }

    public List<String> getCommitHashes(Path repoDirectory){

        ProcessBuilder cd=new ProcessBuilder("git","log","--format=%H","-n","2");
        cd.directory(repoDirectory.toFile());
        Process hashProcess;
        try {
            hashProcess=cd.start();
        } catch (IOException e) {
            throw new GitOperationException("Failed to obtain Commit Hashes For: " + repoUrl);
        }

        BufferedReader reader=new BufferedReader(new InputStreamReader(hashProcess.getInputStream()));
        String line;
        List<String> commitHashes=new ArrayList<>();
        while(true){
            try {
                line=reader.readLine();
                if(line==null){
                    break;
                }
                commitHashes.add(line);

            } catch (IOException e) {
                throw new RuntimeException(e);
            }

        }
        int exitCode;
        try {
            exitCode=hashProcess.waitFor();
        } catch (InterruptedException e) {
            throw new GitOperationException("Failed to obtain Commit Hashes For: "+repoUrl);
        }
        if(exitCode!=0){
            throw new GitOperationException("Failed to obtain Commit Hashes For: "+repoUrl);
        }

        return commitHashes;
    }

    public List<Path> createSnapshots(List<String> commitHashes,Path clonedPath){

        ProcessBuilder checkout=new ProcessBuilder();

        checkout.directory(clonedPath.toFile());
        Process checkoutProcess;
        List<Path> result=new ArrayList<>();
        for(String hash:commitHashes){
            checkout.command("git","checkout",hash);
            try {
                checkoutProcess=checkout.start();
            } catch (IOException e) {
                throw new GitOperationException("Unable to resolve commit hash "+ hash);
            }

            int exitCode;
            try{
                exitCode=checkoutProcess.waitFor();
            } catch (InterruptedException e) {
                throw new GitOperationException("Unable to resolve commit hash "+ hash);
            }

            if(exitCode!=0){
                throw new GitOperationException("Unable to resolve commit hash "+ hash);

            }
            Path dest=Paths.get(baseDirectory.toString(),("snapshot-"+ hash));

            try {
                FileUtils.copyDirectory(clonedPath.toFile(),dest.toFile());
                result.add(dest);
            } catch (IOException e) {
                throw new GitOperationException("Failure in copying snapshot");
            }
        }


        return result;
    }
}
