export type CommandResult<TPayload = unknown> = {
  payload: TPayload;
  textLines: string[];
};

export function writeCommandResult(result: CommandResult, { json, write = console.log }: { json: boolean; write?: (line: string) => void }): void {
  if (json) {
    write(JSON.stringify(result.payload, null, 2));
    return;
  }
  for (const line of result.textLines) write(line);
}
