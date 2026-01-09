// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ISearchOptions } from "@xterm/addon-search";
import { Terminal } from "@xterm/xterm";
import clsx from "clsx";
import * as React from "react";

interface SearchMatchIndicatorProps {
    terminal: Terminal | null;
    searchText: string;
    searchOpts: ISearchOptions;
    activeMatchIndex: number;
    totalMatches: number;
}

const SearchMatchIndicator: React.FC<SearchMatchIndicatorProps> = ({
    terminal,
    searchText,
    searchOpts,
    activeMatchIndex,
    totalMatches,
}) => {
    const [matchLines, setMatchLines] = React.useState<number[]>([]);
    const indicatorRef = React.useRef<HTMLDivElement>(null);

    // Find all matching lines
    React.useEffect(() => {
        if (!terminal || !searchText || searchText.trim() === "") {
            setMatchLines([]);
            return;
        }

        const findMatches = () => {
            const buffer = terminal.buffer.active;
            const totalLines = buffer.length;
            const matches: number[] = [];
            const searchPattern = searchOpts.regex
                ? new RegExp(searchText, searchOpts.caseSensitive ? "g" : "gi")
                : null;

            for (let i = 0; i < totalLines; i++) {
                const line = buffer.getLine(i);
                if (!line) continue;

                const lineText = line.translateToString(true);
                let hasMatch = false;

                if (searchOpts.regex && searchPattern) {
                    try {
                        hasMatch = searchPattern.test(lineText);
                        // Reset regex lastIndex for next iteration
                        searchPattern.lastIndex = 0;
                    } catch (e) {
                        // Invalid regex, skip
                        continue;
                    }
                } else {
                    const searchStr = searchOpts.caseSensitive ? searchText : searchText.toLowerCase();
                    const lineStr = searchOpts.caseSensitive ? lineText : lineText.toLowerCase();
                    if (searchOpts.wholeWord) {
                        const wordBoundaryRegex = new RegExp(`\\b${escapeRegex(searchStr)}\\b`, "i");
                        hasMatch = wordBoundaryRegex.test(lineStr);
                    } else {
                        hasMatch = lineStr.includes(searchStr);
                    }
                }

                if (hasMatch) {
                    // Convert buffer line index to scrollback line index
                    // Buffer lines are 0-indexed from top, scrollback lines are 0-indexed from bottom
                    const scrollbackLine = totalLines - 1 - i;
                    matches.push(scrollbackLine);
                }
            }

            setMatchLines(matches.sort((a, b) => a - b));
        };

        // Debounce the search to avoid performance issues
        const timeoutId = setTimeout(findMatches, 100);
        return () => clearTimeout(timeoutId);
    }, [terminal, searchText, searchOpts]);

    const handleMarkerClick = React.useCallback(
        (line: number, markerIndex: number) => {
            if (!terminal) return;
            const searchAddon = (terminal as any).searchAddon;
            if (!searchAddon || !searchText) return;

            // Convert scrollback line index back to buffer line index
            const buffer = terminal.buffer.active;
            const totalLines = buffer.length;
            const bufferLine = totalLines - 1 - line;

            // Navigate to the match at this line by finding all matches up to this one
            // First, go to the top to start from a known position
            terminal.scrollToLine(0);

            // Then find all matches up to and including the target match
            setTimeout(() => {
                try {
                    for (let i = 0; i <= markerIndex; i++) {
                        searchAddon.findNext(searchText, searchOpts);
                    }

                    // Now scroll to show the match in the viewport
                    // Try to center it, but ensure it's visible
                    const viewportHeight = terminal.rows;
                    const targetScrollLine = Math.max(0, bufferLine - Math.floor(viewportHeight / 3));
                    terminal.scrollToLine(targetScrollLine);
                } catch (e) {
                    // If navigation fails, at least scroll to the right line
                    console.warn("Failed to navigate to match:", e);
                    const viewportHeight = terminal.rows;
                    const targetScrollLine = Math.max(0, bufferLine - Math.floor(viewportHeight / 3));
                    terminal.scrollToLine(targetScrollLine);
                }
            }, 10);
        },
        [terminal, searchText, searchOpts]
    );

    if (!terminal || !searchText || searchText.trim() === "" || matchLines.length === 0) {
        return null;
    }

    const buffer = terminal.buffer.active;
    const totalLines = buffer.length;

    // Calculate the position of each match marker
    const markers = matchLines.map((line) => {
        // Convert scrollback line to buffer line
        const bufferLine = totalLines - 1 - line;
        // Calculate position as percentage (0 = top, 100 = bottom)
        const position = totalLines > 1 ? (bufferLine / (totalLines - 1)) * 100 : 50;
        return { line, position, bufferLine };
    });

    return (
        <div
            ref={indicatorRef}
            className="search-match-indicator"
            style={{
                position: "absolute",
                right: "9px", // Align with scrollbar position
                top: "0",
                bottom: "0",
                width: "6px", // Match scrollbar width
                zIndex: 7, // Below scrollbar overlay but above terminal decorations
                pointerEvents: "none", // Let clicks pass through to scrollbar, but markers will have pointerEvents: auto
            }}
        >
            {markers.map((marker, index) => {
                // activeMatchIndex is 1-based, matchLines is 0-based
                const isActive = totalMatches > 0 && index === activeMatchIndex - 1;
                return (
                    <div
                        key={`${marker.line}-${index}`}
                        className={clsx("search-match-marker", { active: isActive })}
                        style={{
                            position: "absolute",
                            top: `${Math.max(0, Math.min(100, marker.position))}%`,
                            left: "0",
                            width: "6px", // Full width to match scrollbar
                            height: "3px", // Slightly taller for better visibility
                            backgroundColor: isActive ? "#FF9632" : "#FFFF00",
                            opacity: 0.9, // High opacity for visibility through scrollbar
                            cursor: "pointer",
                            transition: "background-color 0.2s, opacity 0.2s",
                            pointerEvents: "auto", // Enable clicks on markers
                            zIndex: 1, // Above the indicator container
                            borderRadius: "1px", // Slight rounding for better appearance
                        }}
                        onClick={(e) => {
                            e.stopPropagation(); // Prevent scrollbar interaction
                            handleMarkerClick(marker.line, index);
                        }}
                        onMouseEnter={(e) => {
                            // Increase opacity on hover for better visibility
                            e.currentTarget.style.opacity = "1";
                        }}
                        onMouseLeave={(e) => {
                            // Restore opacity on leave
                            e.currentTarget.style.opacity = isActive ? "0.95" : "0.9";
                        }}
                        title={`Match ${index + 1} of ${matchLines.length} (line ${marker.line + 1})`}
                    />
                );
            })}
        </div>
    );
};

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export { SearchMatchIndicator };
