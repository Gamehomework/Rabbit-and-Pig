/**
 * Quick smoke test for the messaging module.
 * Run: npx tsx apps/api/src/messaging/test-messaging.ts
 */

import type { Message, NotificationChannel, SendResult } from "./types.js";
import { RateLimiter } from "./rate-limiter.js";
import { NotificationService } from "./service.js";

// --- Mock Channel ---
function createMockChannel(name = "test-channel"): NotificationChannel & { sentMessages: Message[] } {
  const sentMessages: Message[] = [];
  return {
    channelName: name,
    sentMessages,
    async send(message: Message): Promise<SendResult> {
      sentMessages.push(message);
      return {
        success: true,
        messageId: `msg-${sentMessages.length}`,
        timestamp: new Date(),
      };
    },
    validate() {
      return { valid: true };
    },
  };
}

// --- Failing Channel (for retry test) ---
function createFailingChannel(failCount: number): NotificationChannel {
  let calls = 0;
  return {
    channelName: "flaky-channel",
    async send(message: Message): Promise<SendResult> {
      calls++;
      if (calls <= failCount) {
        throw new Error(`Transient failure #${calls}`);
      }
      return { success: true, messageId: `msg-${calls}`, timestamp: new Date() };
    },
    validate() {
      return { valid: true };
    },
  };
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${msg}`);
}

async function main() {
  console.log("=== Messaging Module Tests ===\n");

  // Test 1: Register and send via mock channel
  {
    const service = new NotificationService();
    const mock = createMockChannel();
    service.registerChannel(mock);

    assert(service.listChannels().length === 1, "One channel registered");
    assert(service.getChannel("test-channel") === mock, "getChannel returns the mock");

    const result = await service.send("test-channel", { to: "user@test.com", body: "Hello!" });
    assert(result.success === true, "Send succeeds");
    assert(result.messageId === "msg-1", "MessageId is msg-1");
    assert(mock.sentMessages.length === 1, "Mock received 1 message");
    assert(mock.sentMessages[0].body === "Hello!", "Message body matches");
  }

  // Test 2: Send to unknown channel
  {
    const service = new NotificationService();
    const result = await service.send("nonexistent", { to: "x", body: "y" });
    assert(result.success === false, "Send to unknown channel fails");
    assert(result.error!.includes("not registered"), "Error mentions not registered");
  }

  // Test 3: Rate limiting — send 11 messages, 11th should fail
  {
    const service = new NotificationService({ rateLimiter: { maxTokens: 10, refillRate: 0 } });
    const mock = createMockChannel();
    service.registerChannel(mock);

    const results: SendResult[] = [];
    for (let i = 0; i < 11; i++) {
      results.push(await service.send("test-channel", { to: "u", body: `msg ${i}` }));
    }

    const successes = results.filter((r) => r.success).length;
    const failures = results.filter((r) => !r.success).length;
    assert(successes === 10, `10 messages succeed (got ${successes})`);
    assert(failures === 1, `1 message rate-limited (got ${failures})`);
    assert(results[10].error!.includes("Rate limit"), "11th message error mentions rate limit");
  }

  // Test 4: Retry on transient failure
  {
    const service = new NotificationService({ maxRetries: 1 });
    const flaky = createFailingChannel(1); // fails once, then succeeds
    service.registerChannel(flaky);

    const result = await service.send("flaky-channel", { to: "u", body: "retry me" });
    assert(result.success === true, "Retry succeeds after 1 transient failure");
  }

  // Test 5: Retry exhausted
  {
    const service = new NotificationService({ maxRetries: 1 });
    const flaky = createFailingChannel(5); // always fails
    service.registerChannel(flaky);

    const result = await service.send("flaky-channel", { to: "u", body: "fail me" });
    assert(result.success === false, "Send fails when retries exhausted");
    assert(result.error!.includes("2 attempt(s)"), "Error mentions attempt count");
  }

  // Test 6: RateLimiter standalone
  {
    const limiter = new RateLimiter({ maxTokens: 3, refillRate: 0 });
    const key = RateLimiter.key("ch", "user1");
    assert(limiter.getRemainingTokens(key) === 3, "Starts with 3 tokens");
    assert(limiter.tryConsume(key) === true, "Consume 1st token");
    assert(limiter.tryConsume(key) === true, "Consume 2nd token");
    assert(limiter.tryConsume(key) === true, "Consume 3rd token");
    assert(limiter.tryConsume(key) === false, "4th consume denied");
    assert(limiter.getRemainingTokens(key) === 0, "0 tokens remaining");
  }

  // Test 7: Duplicate channel registration
  {
    const service = new NotificationService();
    service.registerChannel(createMockChannel("dup"));
    let threw = false;
    try {
      service.registerChannel(createMockChannel("dup"));
    } catch {
      threw = true;
    }
    assert(threw, "Duplicate channel registration throws");
  }

  console.log("\n=== All tests passed! ===");
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});

