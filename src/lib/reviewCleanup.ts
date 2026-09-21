import type { AppState } from "../types";

export interface ReviewCleanupOptions {
  topicId?: string;
  includeTasks: boolean;
}

/** Only unfinished topic reviews; never cards, mistakes or completed history. */
export function scheduledReviewTargets(
  state: AppState,
  options: ReviewCleanupOptions,
) {
  const inScope = (topicId: string) =>
    !options.topicId || topicId === options.topicId;
  return {
    reviews: state.reviews.filter(
      (r) => r.status === "pending" && inScope(r.topicId),
    ),
    tasks: options.includeTasks
      ? state.tasks.filter(
          (t) =>
            t.kind === "review" &&
            t.status === "pending" &&
            t.id !== state.activeSession?.taskId &&
            inScope(t.topicId),
        )
      : [],
  };
}
