"use client";

import React from "react";

interface Props {
  content: string;
  className?: string;
}

/**
 * Safe React markdown renderer for assistant responses.
 * Zero external libraries, 100% safe (NO dangerouslySetInnerHTML).
 *
 * Supported elements:
 * - ###, ##, # Headings
 * - Bullet lists (- or *)
 * - Numbered lists (1. , 2. )
 * - Blockquotes (> ) rendered as plain styled paragraphs
 * - **bold** and *italic*
 * - inline `code`
 * - Paragraphs and line breaks
 */

// Parses inline tokens: `code`, **bold**, *italic*
function parseInline(text: string): React.ReactNode[] {
  if (!text) return [];

  // Match: `code`, **bold**, *italic*
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code
          key={i}
          className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[0.875em] text-slate-800 dark:text-slate-200"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return (
        <strong key={i} className="font-semibold text-slate-900 dark:text-slate-100">
          {parseInline(part.slice(2, -2))}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
      return (
        <em key={i} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}

// Renders lines within a paragraph, preserving line breaks
function renderTextWithBreaks(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  lines.forEach((line, index) => {
    if (index > 0) {
      nodes.push(<br key={`br-${index}`} />);
    }
    nodes.push(...parseInline(line));
  });
  return nodes;
}

export function Markdown({ content, className }: Props) {
  if (!content) return null;

  // Split content into blocks by double newlines
  const rawBlocks = content.split(/\n{2,}/);
  const elements: React.ReactNode[] = [];

  rawBlocks.forEach((block, bIdx) => {
    const trimmed = block.trim();
    if (!trimmed) return;

    // Check for headings
    if (trimmed.startsWith("### ")) {
      elements.push(
        <h3
          key={`h3-${bIdx}`}
          className="mt-3 mb-1.5 text-base font-bold text-slate-900 dark:text-slate-100"
        >
          {parseInline(trimmed.slice(4))}
        </h3>
      );
      return;
    }
    if (trimmed.startsWith("## ")) {
      elements.push(
        <h2
          key={`h2-${bIdx}`}
          className="mt-4 mb-2 text-lg font-bold text-slate-900 dark:text-slate-100"
        >
          {parseInline(trimmed.slice(3))}
        </h2>
      );
      return;
    }
    if (trimmed.startsWith("# ")) {
      elements.push(
        <h1
          key={`h1-${bIdx}`}
          className="mt-4 mb-2 text-xl font-bold text-slate-900 dark:text-slate-100"
        >
          {parseInline(trimmed.slice(2))}
        </h1>
      );
      return;
    }

    // Check for Blockquotes (> ...) -> render as plain paragraphs per spec
    if (trimmed.startsWith("> ")) {
      const quoteText = trimmed
        .split("\n")
        .map((l) => (l.startsWith("> ") ? l.slice(2) : l.startsWith(">") ? l.slice(1) : l))
        .join("\n");
      elements.push(
        <p key={`quote-${bIdx}`} className="leading-relaxed text-slate-700 dark:text-slate-300">
          {renderTextWithBreaks(quoteText)}
        </p>
      );
      return;
    }

    // Check for bullet lists
    const lines = trimmed.split("\n");
    const isBulletList = lines.every((l) => /^\s*[-*]\s+/.test(l));
    if (isBulletList) {
      elements.push(
        <ul
          key={`ul-${bIdx}`}
          className="my-2 list-disc list-outside pl-5 space-y-1 text-slate-800 dark:text-slate-200"
        >
          {lines.map((l, lIdx) => {
            const itemText = l.replace(/^\s*[-*]\s+/, "");
            return (
              <li key={`li-${lIdx}`} className="leading-relaxed">
                {parseInline(itemText)}
              </li>
            );
          })}
        </ul>
      );
      return;
    }

    // Check for numbered lists
    const isNumberedList = lines.every((l) => /^\s*\d+\.\s+/.test(l));
    if (isNumberedList) {
      elements.push(
        <ol
          key={`ol-${bIdx}`}
          className="my-2 list-decimal list-outside pl-5 space-y-1 text-slate-800 dark:text-slate-200"
        >
          {lines.map((l, lIdx) => {
            const itemText = l.replace(/^\s*\d+\.\s+/, "");
            return (
              <li key={`oli-${lIdx}`} className="leading-relaxed">
                {parseInline(itemText)}
              </li>
            );
          })}
        </ol>
      );
      return;
    }

    // Default: paragraph
    elements.push(
      <p
        key={`p-${bIdx}`}
        className="leading-relaxed text-slate-800 dark:text-slate-200"
      >
        {renderTextWithBreaks(trimmed)}
      </p>
    );
  });

  return <div className={`space-y-3 ${className ?? ""}`}>{elements}</div>;
}

