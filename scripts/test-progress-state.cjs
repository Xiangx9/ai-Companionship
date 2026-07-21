/**
 * Lightweight self-check for progressState (no test runner required).
 * Run: node scripts/test-progress-state.cjs
 * Mirrors rules in src/utils/progressState.ts — keep in sync when rules change.
 */
function apply(state, event, now = "2026-01-01T00:00:00.000Z") {
  let next = { ...state };
  const ensure = () => {
    if (next.status === "not_started") {
      next.status = "in_progress";
      next.startedAt = next.startedAt || now;
    } else if (!next.startedAt) next.startedAt = now;
  };
  const maybeComplete = () => {
    if (next.status === "mastered" || next.status === "completed") return;
    if ((next.teachInteractions || 0) >= 1 && (next.practicePassCount || 0) >= 1) {
      next.status = "completed";
      next.completedAt = now;
      next.startedAt = next.startedAt || now;
    }
  };
  if (event.type === "open") {
    ensure();
    return next;
  }
  if (event.type === "teach_interact") {
    ensure();
    next.teachInteractions = (next.teachInteractions || 0) + 1;
    maybeComplete();
    return next;
  }
  if (event.type === "practice_result") {
    ensure();
    next.practiceAttempts = (next.practiceAttempts || 0) + 1;
    if (event.passed) next.practicePassCount = (next.practicePassCount || 0) + 1;
    maybeComplete();
    return next;
  }
  if (event.type === "quiz_result") {
    ensure();
    next.quizScore = event.percentage;
    if (event.percentage >= 80) {
      next.status = "mastered";
      next.completedAt = now;
    } else if (event.percentage >= 60 && next.status !== "mastered") {
      next.status = "completed";
      next.completedAt = now;
    }
    return next;
  }
  if (event.type === "manual") {
    next.status = event.status;
    return next;
  }
  return next;
}

function recommend(input) {
  if (input.status === "mastered") return "review";
  const taught = input.teachInteractions >= 1 || input.hasTeacherMessage;
  if (!taught) return "explain";
  if (input.practicePassCount < 1) return "exercise";
  if (input.quizScore === undefined || input.quizScore < 80) return "test";
  return "done";
}

const base = () => ({
  status: "not_started",
  teachInteractions: 0,
  practicePassCount: 0,
  practiceAttempts: 0,
});

let failed = 0;
function assert(name, cond) {
  if (!cond) {
    console.error("FAIL", name);
    failed++;
  } else {
    console.log("ok  ", name);
  }
}

assert("open only -> in_progress", apply(base(), { type: "open" }).status === "in_progress");
assert("open only not mastered", apply(base(), { type: "open" }).status !== "mastered");
assert(
  "teach alone not completed",
  apply(apply(base(), { type: "open" }), { type: "teach_interact" }).status === "in_progress"
);
assert(
  "teach + practice -> completed",
  apply(
    apply(apply(base(), { type: "open" }), { type: "teach_interact" }),
    { type: "practice_result", passed: true }
  ).status === "completed"
);
assert(
  "practice alone not completed",
  apply(apply(base(), { type: "open" }), { type: "practice_result", passed: true }).status ===
    "in_progress"
);
assert("quiz 80 -> mastered", apply(base(), { type: "quiz_result", percentage: 80 }).status === "mastered");
assert("quiz 60 -> completed", apply(base(), { type: "quiz_result", percentage: 60 }).status === "completed");
assert("quiz 40 stays in_progress", apply(base(), { type: "quiz_result", percentage: 40 }).status === "in_progress");
const mastered = apply(base(), { type: "quiz_result", percentage: 90 });
assert(
  "failed quiz does not demote mastered",
  apply(mastered, { type: "quiz_result", percentage: 30 }).status === "mastered"
);
assert("next: new -> explain", recommend({ status: "not_started", teachInteractions: 0, practicePassCount: 0 }) === "explain");
assert(
  "next: taught -> exercise",
  recommend({ status: "in_progress", teachInteractions: 1, practicePassCount: 0 }) === "exercise"
);
assert(
  "next: practiced -> test",
  recommend({ status: "completed", teachInteractions: 1, practicePassCount: 1 }) === "test"
);
assert(
  "next: mastered -> review",
  recommend({ status: "mastered", teachInteractions: 2, practicePassCount: 2, quizScore: 90 }) === "review"
);

if (failed) {
  console.error("\n" + failed + " failed");
  process.exit(1);
}
console.log("\nall progress-state checks passed");
