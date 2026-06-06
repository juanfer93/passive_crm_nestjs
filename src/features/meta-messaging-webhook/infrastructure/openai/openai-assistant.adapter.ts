import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import { AssistantContext } from '@/features/meta-messaging-webhook/domain/entities/assistant-context.entity';
import {
  LeadCustomFields,
  LeadCustomFieldsContext,
} from '@/features/meta-messaging-webhook/domain/entities/lead-custom-fields.entity';
import { MediaContent } from '@/features/meta-messaging-webhook/domain/entities/media-content.entity';
import { AssistantReplyGeneratorPort } from '@/features/meta-messaging-webhook/domain/ports/assistant-reply-generator.port';
import { LeadCustomFieldsExtractorPort } from '@/features/meta-messaging-webhook/domain/ports/lead-custom-fields-extractor.port';
import { MediaAnalyzerPort } from '@/features/meta-messaging-webhook/domain/ports/media-analyzer.port';
import { normalizeLeadCustomFields } from '@/features/meta-messaging-webhook/domain/services/lead-custom-fields-normalizer.service';

@Injectable()
export class OpenAiAssistantAdapter
  implements AssistantReplyGeneratorPort, MediaAnalyzerPort, LeadCustomFieldsExtractorPort
{
  private readonly client: OpenAI;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.config.getOrThrow<string>('OPENAI_API_KEY'),
    });
  }

  async generateReply(context: AssistantContext): Promise<string> {
    const model = this.config.get<string>('OPENAI_CHAT_MODEL', 'gpt-4.1-mini');
    const history = context.recentMessages
      .map((message) => `${message.direction}: ${message.text}`)
      .join('\n');

    const response = await this.client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a concise Messenger and Instagram assistant. Reply naturally, keep latency low, and avoid mentioning internal CRM synchronization.',
        },
        {
          role: 'user',
          content: `Channel: ${context.channel}\nContact id: ${context.contactId}\nRecent conversation:\n${history}\n\nLatest user message:\n${context.userMessage}`,
        },
      ],
    });

    return response.choices[0]?.message.content?.trim() || 'Gracias, ya reviso tu mensaje.';
  }

  async extractLeadCustomFields(context: LeadCustomFieldsContext): Promise<LeadCustomFields> {
    const model = this.config.get<string>('OPENAI_CHAT_MODEL', 'gpt-4.1-mini');
    const history = context.recentMessages
      .map((message) => `${message.direction}: ${message.text}`)
      .join('\n');

    const response = await this.client.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'Extract lead custom fields from a Messenger or Instagram vehicle sales chat.',
            'Return only a JSON object with these keys when known: purchase_timeline, vehicle_type, down_payment, document_status, phone.',
            'purchase_timeline must be a short Spanish string such as "esta semana", "este mes", "solo estoy mirando", or "el otro mes" when the chat supports it.',
            'vehicle_type is the vehicle type or model preference mentioned by the lead.',
            'down_payment is the initial payment amount or phrase mentioned by the lead.',
            'document_status is true/false when the lead clearly confirms whether they have ID and bank account; otherwise use the exact short status string.',
            'phone must contain digits only. If the number starts with country code 1 and has 11 digits, return the 10 digit national number. For other countries, keep the country code without plus sign.',
            'Do not invent values. Use null for unknown fields.',
          ].join(' '),
        },
        {
          role: 'user',
          content: `Channel: ${context.channel}\nContact id: ${context.contactId}\nConversation history:\n${history}`,
        },
      ],
    });

    return normalizeLeadCustomFields(response.choices[0]?.message.content);
  }

  async transcribeAudio(media: MediaContent): Promise<string> {
    const model = this.config.get<string>('OPENAI_TRANSCRIPTION_MODEL', 'gpt-4o-mini-transcribe');
    const file = await toFile(media.bytes, `${media.id}.bin`, { type: media.mimeType });
    const result = await this.client.audio.transcriptions.create({ file, model });

    return result.text;
  }

  async describeImage(media: MediaContent): Promise<string> {
    const model = this.config.get<string>('OPENAI_VISION_MODEL', 'gpt-4.1-mini');
    const dataUrl = `data:${media.mimeType};base64,${media.bytes.toString('base64')}`;
    const response = await this.client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'Describe the relevant business meaning of the Meta messaging image in one short paragraph.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this Messenger or Instagram image for the backend conversation state.' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    return response.choices[0]?.message.content?.trim() || 'Image received.';
  }
}
