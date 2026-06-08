import { Injectable } from '@nestjs/common';
import {
  ConversationMessageKind,
  MetaMessagingChannel,
} from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import { IncomingMetaMessage } from '@/features/meta-messaging-webhook/domain/entities/incoming-meta-message.entity';
import {
  MetaMessagingAttachment,
  MetaMessagingEvent,
  MetaWebhookMessage,
  MetaWebhookPayload,
} from '@/features/meta-messaging-webhook/domain/types/meta-webhook-payload.type';

@Injectable()
export class MetaWebhookMessageExtractor {
  extract(payload: MetaWebhookPayload): IncomingMetaMessage[] {
    const channel = this.resolveChannel(payload.object);

    if (!channel) {
      return [];
    }

    return (
      payload.entry?.flatMap((entry) => {
        const messagingMessages =
          entry.messaging
            ?.map((event) => this.toMetaMessagingMessage(channel, entry.id, event))
            .filter((message): message is IncomingMetaMessage => Boolean(message)) ?? [];

        const legacyMessages =
          entry.changes?.flatMap((change) =>
            change.value?.messages?.map((message) =>
              this.toLegacyMetaMessage(channel, message),
            ) ?? [],
          ) ?? [];

        return [...messagingMessages, ...legacyMessages];
      }) ?? []
    );
  }

  private resolveChannel(object: string): MetaMessagingChannel | null {
    if (object === 'instagram') {
      return 'instagram';
    }

    if (object === 'page') {
      return 'messenger';
    }

    return null;
  }

  private toMetaMessagingMessage(
    channel: MetaMessagingChannel,
    entryId: string,
    event: MetaMessagingEvent,
  ): IncomingMetaMessage | null {
    const senderId = event.sender?.id;
    const occurredAt = event.timestamp ? new Date(event.timestamp) : new Date();

    if (!senderId || !event.message) {
      return null;
    }

    const attachment = event.message.attachments?.[0];
    const kind = this.resolveAttachmentKind(attachment);
    const messageId =
      event.message.mid ?? `${channel}:${entryId}:${senderId}:${occurredAt.getTime()}`;

    return {
      messageId,
      channel,
      contactId: senderId,
      pageId: event.recipient?.id,
      kind: event.message.text ? 'text' : kind,
      text: event.message.text,
      mediaReference: attachment?.payload?.url,
      occurredAt,
    };
  }

  private resolveAttachmentKind(attachment?: MetaMessagingAttachment): ConversationMessageKind {
    if (attachment?.type === 'image') {
      return 'image';
    }

    if (attachment?.type === 'audio') {
      return 'audio';
    }

    return 'unknown';
  }

  private toLegacyMetaMessage(
    channel: MetaMessagingChannel,
    message: MetaWebhookMessage,
  ): IncomingMetaMessage {
    const occurredAt = message.timestamp
      ? new Date(Number(message.timestamp) * 1000)
      : new Date();

    if (message.type === 'text') {
      return {
        messageId: message.id,
        channel,
        contactId: message.from,
        kind: 'text',
        text: message.text?.body ?? '',
        occurredAt,
      };
    }

    if (message.type === 'audio') {
      return {
        messageId: message.id,
        channel,
        contactId: message.from,
        kind: 'audio',
        mediaReference: message.audio?.id,
        occurredAt,
      };
    }

    if (message.type === 'image') {
      return {
        messageId: message.id,
        channel,
        contactId: message.from,
        kind: 'image',
        text: message.image?.caption,
        mediaReference: message.image?.id,
        occurredAt,
      };
    }

    return {
      messageId: message.id,
      channel,
      contactId: message.from,
      kind: 'unknown',
      text: `Unsupported Meta message type: ${message.type}`,
      occurredAt,
    };
  }
}
