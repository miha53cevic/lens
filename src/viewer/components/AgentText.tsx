/**
 * The agent's words as they read: its `backticks` as code, and nothing else of markdown. The text
 * stays React's to escape, and agent text that goes to the agent or a title keeps its backticks.
 */
export function AgentText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`+[^`]+`+)/).map((part, partIndex) => {
        const code = /^(`+)([^`]+)\1$/.exec(part);
        return code ? (
          <code key={partIndex} className='rounded-xs bg-surface-2 px-1 font-mono'>
            {code[2]}
          </code>
        ) : (
          part
        );
      })}
    </>
  );
}
