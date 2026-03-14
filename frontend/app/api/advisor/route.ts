const PROTOCOL_CONTEXT = `DotLend is the first EVM-native money market on Polkadot Hub (Chain ID 420420417).
It is an Aave/Compound-style lending market — NOT a synthetic stablecoin issuer.
Testnet uses MockUSDH (mint/burn). Mainnet will use Hollar (real stablecoin, lending reserve model — principal returns to reserve, only stability fee accrues to treasury).
Key parameters: LTV 70% | Liquidation threshold 80% | Stability fee 0.5%/yr | Liquidation bonus 5% | Oracle stale after 1 hour.
ZK solvency proofs use a Noir UltraHonk circuit. Testnet uses MockSolvencyVerifier (BN254 precompile pending on PolkaVM).
Always be concise, accurate, and never invent on-chain numbers.`;

export async function POST(req: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "GROQ_API_KEY not configured" }, { status: 503 });
  }

  try {
    const { messages, systemPrompt } = await req.json();
    const fullSystemPrompt = `${PROTOCOL_CONTEXT}\n\n${systemPrompt ?? ""}`.trim();

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 400,
        stream: true,
        messages: [
          { role: "system", content: fullSystemPrompt },
          ...messages,
        ],
      }),
    });

    if (!res.ok || !res.body) {
      const err = await res.text();
      return Response.json({ error: err }, { status: res.status });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const reader = res.body!.getReader();
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const json = line.slice(6).trim();
              if (!json || json === "[DONE]") continue;
              try {
                const parsed = JSON.parse(json);
                const text = parsed?.choices?.[0]?.delta?.content;
                if (text) controller.enqueue(encoder.encode(text));
              } catch {
                // skip malformed chunks
              }
            }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Stream error";
          controller.enqueue(encoder.encode(`\n[Error: ${msg}]`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
