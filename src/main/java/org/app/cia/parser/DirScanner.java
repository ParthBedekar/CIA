package org.app.cia.parser;


import org.app.cia.parser.Enums.Language;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class DirScanner {

    public Map<Language, List<Path>> traverse(List<Path> snapshots) {
        Map<Language, List<Path>> fileMap = new HashMap<>();

        for(Path snapshot:snapshots){
            try {
                Files.walk(snapshot).forEach(path-> {
                    if(path.toString().endsWith(".java")){
                        fileMap.computeIfAbsent(Language.JAVA,k->new ArrayList<>()).add(path);
                    }else if(path.toString().endsWith(".js")){
                        fileMap.computeIfAbsent(Language.JS,k->new ArrayList<>()).add(path);
                    }
                });

            } catch (IOException e) {
                throw new RuntimeException("Directory Traversal Unsuccessful for: "+snapshot);
            }
        }
        return fileMap;
    }
}
