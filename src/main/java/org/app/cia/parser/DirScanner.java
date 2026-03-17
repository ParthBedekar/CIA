package org.app.cia.parser;


import org.app.cia.parser.Enums.Language;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class DirScanner {

    public Map<Language, List<Path>> traverseChanged(Path snapshot, List<String> changedFiles){
        Map<Language, List<Path>> fileMap = new HashMap<>();
        for(String filename : changedFiles){
            Path path = snapshot.resolve(filename);
            if(!Files.exists(path)) continue;
            if(filename.endsWith(".java")){
                fileMap.computeIfAbsent(Language.JAVA, k -> new ArrayList<>()).add(path);
            } else if(filename.endsWith(".js") && !filename.contains("node_modules")){
                fileMap.computeIfAbsent(Language.JS, k -> new ArrayList<>()).add(path);
            }
        }
        return fileMap;
    }
    public Map<Language, List<Path>> traverseChangedWithDeletion(
            Path currentSnapshot, Path oldSnapshot, List<String> changedFiles) {
        Map<Language, List<Path>> fileMap = new HashMap<>();
        for (String filename : changedFiles) {
            // Try current snapshot first, fall back to old snapshot
            Path path = currentSnapshot.resolve(filename);
            if (!Files.exists(path)) {
                path = oldSnapshot.resolve(filename);
            }
            if (!Files.exists(path)) continue;
            if (filename.endsWith(".java")) {
                fileMap.computeIfAbsent(Language.JAVA, k -> new ArrayList<>()).add(path);
            } else if (filename.endsWith(".js") && !filename.contains("node_modules")) {
                fileMap.computeIfAbsent(Language.JS, k -> new ArrayList<>()).add(path);
            }
        }
        return fileMap;
    }
}
