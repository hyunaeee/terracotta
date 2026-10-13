export type ToolRisk = "read" | "write";

export type ToolPolicyMetadata = {
  name?: string;
  description?: string;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
};

// Keep the agent and direct API on the same conservative classification policy.
export function toolRisk(tool: ToolPolicyMetadata): ToolRisk {
  if (tool.annotations?.destructiveHint) return "write";
  const text = `${tool.name ?? ""} ${tool.description ?? ""}`.toLowerCase();
  const writes = /(create|update|delete|remove|write|send|post|publish|merge|close|reopen|add|edit|set|change|upload|move|assign|comment|reply|message|email|pay|refund|charge|deploy|execute|trigger|approve|reject|cancel|invite|share|생성|수정|삭제|전송|게시|결제)/;
  if (writes.test(text)) return "write";
  if (tool.annotations?.readOnlyHint === true) return "read";
  const reads = /(get|list|search|read|fetch|query|find|lookup|inspect|view|download|status|history|retrieve|describe|검색|조회|읽기|목록)/;
  return reads.test(text) ? "read" : "write";
}
