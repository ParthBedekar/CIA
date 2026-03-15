package org.app.cia.ingestion;

import java.nio.file.Path;
import java.util.List;

public class IngestionService {
    GitManager gitManager;
    public IngestionService(String url, Path base){
         gitManager=new GitManager(url,base);
    }

    public List<Path> ingest(){

        Path repoDir=gitManager.cloneRepo();

        List<String> commitHashes=gitManager.getCommitHashes(repoDir);

        return gitManager.createSnapshots(commitHashes,repoDir);
    }

}
