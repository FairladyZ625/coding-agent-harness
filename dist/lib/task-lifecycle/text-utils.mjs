// @ts-ignore core-shared remains a JS runtime dependency until its migration PR.
import { nowTimestamp } from "../core-shared.mjs";
export function appendProgressLog(content, { event, message, evidence, actor = "coordinator" }) {
    const timestamp = nowTimestamp();
    const safeMessage = String(message || event).replace(/\r?\n/g, " ").trim();
    const safeEvidence = String(evidence || "n/a").replace(/\r?\n/g, " ").trim();
    if (/^##\s*Log\s*$/im.test(content)) {
        return content.replace(/(^##\s*Log\s*$[\s\S]*?\| --- \| --- \| --- \| --- \| --- \|\n)/im, `$1| ${timestamp} | ${actor} | ${event}: ${safeMessage} | ${safeEvidence} | ${event === "task-complete" ? "done" : "continue"} |\n`);
    }
    if (/^##\s*进度记录\s*$/im.test(content)) {
        return `${content.trimEnd()}\n\n### [${timestamp}] - ${event}\n\n- 做了什么：${safeMessage}\n- 验证结果：已记录\n- 下一步：${event === "task-complete" ? "完成" : "继续执行"}\n- 证据：${safeEvidence}\n`;
    }
    return `${content.trimEnd()}\n\n## Log\n\n| Time | Actor | Action | Evidence | Next |\n| --- | --- | --- | --- | --- |\n| ${timestamp} | ${actor} | ${event}: ${safeMessage} | ${safeEvidence} | ${event === "task-complete" ? "done" : "continue"} |\n`;
}
export function markdownCell(value) {
    return String(value || "")
        .replace(/\r?\n/g, " ")
        .replaceAll("|", "\\|")
        .trim();
}
export function markWalkthroughClosed(content) {
    if (/^Closeout Status\s*:/im.test(content)) {
        return content.replace(/^Closeout Status\s*:[^\n]*/im, "Closeout Status: closed").trimEnd() + "\n";
    }
    return `${String(content || "").trimEnd()}\n\nCloseout Status: closed\n`;
}
