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
    const [cols, setCols] = React.useState<number>(terminal?.cols ?? 80);

    // Listen for terminal resize events to recalculate positions when width changes
    React.useEffect(() => {
        if (!terminal) return;

        // Initialize cols
        setCols(terminal.cols);

        // Listen for resize events
        // onResize returns a disposable object that can be used to unsubscribe
        const disposable = terminal.onResize(() => {
            setCols(terminal.cols);
        });

        return () => {
            // Cleanup: dispose the event listener
            disposable.dispose();
        };
    }, [terminal]);

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
    // Use state cols to trigger recalculation when width changes
    const currentCols = cols;

    // Calculate visual line positions considering line wrapping
    // Each buffer line may wrap to multiple visual lines if it exceeds terminal width
    const calculateVisualLinePosition = (bufferLineIndex: number): number => {
        let visualLineCount = 0;

        // Count visual lines for all buffer lines up to and including the target line
        for (let i = 0; i <= bufferLineIndex; i++) {
            const line = buffer.getLine(i);
            if (line) {
                const lineLength = line.length;
                // Calculate how many visual lines this buffer line occupies
                // Each visual line can hold 'currentCols' characters
                const visualLinesForThisLine = Math.max(1, Math.ceil(lineLength / currentCols));
                visualLineCount += visualLinesForThisLine;
            } else {
                // Empty line still takes one visual line
                visualLineCount += 1;
            }
        }

        return visualLineCount;
    };

    // Calculate total visual lines in the buffer
    let totalVisualLines = 0;
    for (let i = 0; i < totalLines; i++) {
        const line = buffer.getLine(i);
        if (line) {
            const lineLength = line.length;
            totalVisualLines += Math.max(1, Math.ceil(lineLength / currentCols));
        } else {
            totalVisualLines += 1;
        }
    }

    // Calculate the position of each match marker based on visual lines
    const markers = matchLines.map((line, index) => {
        // Convert scrollback line to buffer line
        const bufferLine = totalLines - 1 - line;
        // Calculate visual line position for this buffer line
        const visualLinePosition = calculateVisualLinePosition(bufferLine);
        // Calculate position as percentage based on visual lines (0 = top, 100 = bottom)
        const position = totalVisualLines > 1 ? ((visualLinePosition - 1) / (totalVisualLines - 1)) * 100 : 50;
        return { line, position, bufferLine, originalIndex: index };
    });

    // Merge nearby markers into blocks
    // Threshold: if markers are within 0.5% of position, merge them
    const MERGE_THRESHOLD = 0.5;
    const mergedBlocks: Array<{
        startPosition: number;
        endPosition: number;
        startLine: number;
        endLine: number;
        startIndex: number;
        endIndex: number;
        containsActive: boolean;
    }> = [];

    if (markers.length > 0) {
        let currentBlock = {
            startPosition: markers[0].position,
            endPosition: markers[0].position,
            startLine: markers[0].line,
            endLine: markers[0].line,
            startIndex: markers[0].originalIndex,
            endIndex: markers[0].originalIndex,
            containsActive: false,
        };

        for (let i = 1; i < markers.length; i++) {
            const prevMarker = markers[i - 1];
            const currMarker = markers[i];
            const positionDiff = Math.abs(currMarker.position - prevMarker.position);

            if (positionDiff <= MERGE_THRESHOLD) {
                // Merge into current block
                currentBlock.endPosition = currMarker.position;
                currentBlock.endLine = currMarker.line;
                currentBlock.endIndex = currMarker.originalIndex;
            } else {
                // Save current block and start a new one
                mergedBlocks.push(currentBlock);
                currentBlock = {
                    startPosition: currMarker.position,
                    endPosition: currMarker.position,
                    startLine: currMarker.line,
                    endLine: currMarker.line,
                    startIndex: currMarker.originalIndex,
                    endIndex: currMarker.originalIndex,
                    containsActive: false,
                };
            }
        }
        // Don't forget the last block
        mergedBlocks.push(currentBlock);
    }

    // Check which blocks contain the active match
    mergedBlocks.forEach((block) => {
        const activeIndex = activeMatchIndex - 1; // Convert to 0-based
        block.containsActive = totalMatches > 0 && activeIndex >= block.startIndex && activeIndex <= block.endIndex;
    });

    return (
        <div
            ref={indicatorRef}
            className="search-match-indicator"
            style={{
                position: "absolute",
                right: "5px", // Align with scrollbar position (same as xterm-viewport right: 0)
                top: "0",
                bottom: "0",
                width: "5px", // Match scrollbar width
                zIndex: 7, // Below scrollbar overlay but above terminal decorations
                pointerEvents: "none", // Let clicks pass through to scrollbar, but markers will have pointerEvents: auto
            }}
        >
            {mergedBlocks.map((block, blockIndex) => {
                const topPosition = Math.max(0, Math.min(100, block.startPosition)) - 0.0;
                const matchCount = block.endIndex - block.startIndex + 1;
                const isActive = block.containsActive;
                // Use fixed height: 3px for single match, 4px for multiple matches
                const height = matchCount === 1 ? "3px" : "4px";

                return (
                    <div
                        key={`block-${block.startLine}-${block.endLine}-${blockIndex}`}
                        className={clsx("search-match-marker", { active: isActive })}
                        style={{
                            position: "absolute",
                            top: `${topPosition}%`,
                            left: "0",
                            width: "5px", // Full width to match scrollbar
                            height: height, // Fixed height to avoid oversized blocks
                            backgroundColor: "#FFFF00", // Consistent color for all matches
                            opacity: 0.4, // More transparent for subtle indication
                            cursor: "pointer",
                            transition: "background-color 0.2s, opacity 0.2s",
                            pointerEvents: "auto", // Enable clicks on markers
                            zIndex: 1, // Above the indicator container
                            borderRadius: "1px", // Slight rounding for better appearance
                        }}
                        onClick={(e) => {
                            e.stopPropagation(); // Prevent scrollbar interaction
                            // Navigate to the first match in the block
                            handleMarkerClick(block.startLine, block.startIndex);
                        }}
                        onMouseEnter={(e) => {
                            // Increase opacity on hover for better visibility
                            e.currentTarget.style.opacity = "0.9";
                        }}
                        onMouseLeave={(e) => {
                            // Restore opacity on leave
                            e.currentTarget.style.opacity = "0.4";
                        }}
                        title={
                            matchCount > 1
                                ? `${matchCount} matches (lines ${block.startLine + 1}-${block.endLine + 1})`
                                : `Match ${block.startIndex + 1} of ${matchLines.length} (line ${block.startLine + 1})`
                        }
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
