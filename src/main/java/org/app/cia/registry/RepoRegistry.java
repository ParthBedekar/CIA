package org.app.cia.registry;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.nio.file.Path;
import java.util.List;

@Getter
@AllArgsConstructor
public class RepoRegistry {
    private Path clonedPath;
    private Path currentSnapshot;
    private Path previousSnapshot;
    private String currentHash;
    private String previousHash;
    private List<String> changedFiles;
}