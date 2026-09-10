"use client";

import { BarChart3, Pencil } from "lucide-react";
import type { MessageDto, PollMetadata } from "@/shared/types";
import { api } from "../../api";
import { formatDateTime } from "../../format";
import { useI18n } from "../../i18n";
import { useApp, useDirectory } from "../../store";

export function PollMessage({ message }: { message: MessageDto }) {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const directory = useDirectory();
  const metadata = message.metadata as PollMetadata | null;
  if (metadata?.kind !== "poll") return null;

  const poll = metadata.poll;
  const votes = poll.votes ?? {};
  const myVotes = votes[state.session?.id ?? ""] ?? [];
  const totalVotes = Object.keys(votes).length;
  const closed = poll.settings.closesAt ? new Date(poll.settings.closesAt).getTime() <= Date.now() : false;
  const isCreator = message.senderId === state.session?.id;

  const optionCounts = new Map(poll.options.map((option) => [option.id, 0]));
  for (const optionIds of Object.values(votes)) {
    for (const optionId of optionIds) optionCounts.set(optionId, (optionCounts.get(optionId) ?? 0) + 1);
  }
  const maxCount = Math.max(1, ...Array.from(optionCounts.values()));

  const toggleVote = async (optionId: string) => {
    if (closed) return;
    const nextVotes = poll.settings.allowMultipleVotes
      ? myVotes.includes(optionId)
        ? myVotes.filter((id) => id !== optionId)
        : [...myVotes, optionId]
      : myVotes.includes(optionId)
        ? []
        : [optionId];
    try {
      const { message: updated } = await api.messages.votePoll(message.id, nextVotes);
      actions.upsertMessage(updated);
    } catch (error) {
      actions.fail(error);
    }
  };

  return (
    <div className="poll-message">
      <div className="poll-title">
        <BarChart3 size={17} />
        <strong>{poll.question}</strong>
        {isCreator ? (
          <button
            type="button"
            className="icon-button"
            aria-label={t("poll.editPoll")}
            onClick={() => actions.setModal({ kind: "poll", conversationId: message.conversationId, messageId: message.id })}
          >
            <Pencil size={14} />
          </button>
        ) : null}
      </div>
      <div className="poll-options" role="group" aria-label={poll.question}>
        {poll.options.map((option) => {
          const count = optionCounts.get(option.id) ?? 0;
          const selected = myVotes.includes(option.id);
          const voters = Object.entries(votes)
            .filter(([, optionIds]) => optionIds.includes(option.id))
            .map(([userId]) => directory.get(userId)?.displayName ?? t("app.unknown"));
          return (
            <button
              key={option.id}
              type="button"
              className={`poll-option ${selected ? "is-selected" : ""}`}
              disabled={closed}
              onClick={() => void toggleVote(option.id)}
            >
              <span className="poll-option-fill" style={{ width: `${(count / maxCount) * 100}%` }} />
              <span className="poll-option-content">
                <span>{option.text}</span>
                {poll.settings.showVotesPerOption ? <strong>{t("poll.voteCount", { count })}</strong> : null}
              </span>
              {poll.settings.showVotersPerOption && voters.length > 0 ? <small>{voters.join(", ")}</small> : null}
            </button>
          );
        })}
      </div>
      <div className="poll-meta">
        {poll.settings.showTotalVotes ? <span>{t("poll.totalVotes", { count: totalVotes })}</span> : null}
        {poll.settings.showVoters && totalVotes > 0 ? (
          <span>
            {Object.keys(votes)
              .map((userId) => directory.get(userId)?.displayName ?? t("app.unknown"))
              .join(", ")}
          </span>
        ) : null}
        {poll.settings.closesAt ? (
          <span>
            {closed
              ? t("poll.closedAt", { time: formatDateTime(poll.settings.closesAt, state.session?.preferences?.timeFormat ?? "12h") })
              : t("poll.closesAtLabel", { time: formatDateTime(poll.settings.closesAt, state.session?.preferences?.timeFormat ?? "12h") })}
          </span>
        ) : null}
      </div>
    </div>
  );
}
