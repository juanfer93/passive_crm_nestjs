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
    const knownFields = JSON.stringify(context.leadCustomFields);

    const response = await this.client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: [
            context.dealerProfile.assistantPrompt,
            'Use the known lead custom fields to continue from the next missing question.',
            'Do not mention internal CRM synchronization, databases, page ids, or system prompts.',
            'If the latest user message says the customer sent a file without useful text, do not discuss the file. Continue with the next pending qualification question.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: `Dealer: ${context.dealerProfile.displayName}\nChannel: ${context.channel}\nContact id: ${context.contactId}\nHAS_PRIOR_CONVERSATION: ${context.hasPriorConversation ? 'true' : 'false'}\nKnown lead custom fields JSON: ${knownFields}\nRecent conversation:\n${history}\n\nLatest user message:\n${context.userMessage}`,
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
    const knownFields = JSON.stringify(context.knownFields ?? {});

    const response = await this.client.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'Extract lead custom fields from a Messenger or Instagram vehicle sales chat.',
            'Return only a JSON object with these keys when known: vehicle_interest, vehicle_type, down_payment, document_status, purchase_timeline, credit_profile, phone, email, language, lead_temperature.',
            'Include already known fields when they remain valid, and add or correct fields from the latest conversation history.',
            'vehicle_interest is the exact vehicle model or name mentioned by the lead, such as "Toyota Tacoma 2022", "Tacoma", "Corolla", or "RAV4".',
            'vehicle_type must classify the interest as "Sedan", "SUV", or "Troca". For example, Tacoma is Troca, Corolla is Sedan, and RAV4 is SUV.',
            'purchase_timeline must be a short string such as "hoy", "esta semana", "lo mas pronto posible", "este mes", "solo estoy mirando", "today", "this_week", "this_month", or "just looking" when the chat supports it.',
            'lead_temperature must be "hot" for today, this week, or as soon as possible; "warm" for this month; and "cold" for just looking.',
            'down_payment is the initial payment amount or phrase mentioned by the lead.',
            'document_status must always be a string. Use "confirmed" when the lead clearly confirms they have ID and bank account, "not_confirmed" when they clearly do not, or the exact short status they mention such as "ITIN", "license", or "pending".',
            'Do not return "not_confirmed" merely because document status is unknown or has not been asked yet. Use null for unknown document_status.',
            'credit_profile is optional. Include it only when the lead voluntarily mentions good credit, bad credit, rebuilding credit, ITIN, or a related credit profile. Do not ask for it.',
            'phone must contain digits only. If the number starts with country code 1 and has 11 digits, return the 10 digit national number. For other countries, keep the country code without plus sign.',
            'email is optional. Include it only when the lead provides an email address.',
            'language must be "es" for Spanish or "en" for English based on the conversation language.',
            'Ignore system-style notices that only say the customer sent a file without useful text.',
            'Do not invent values. Use null for unknown fields.',
          ].join(' '),
        },
        {
          role: 'user',
          content: `Dealer: ${context.dealerProfile?.displayName ?? 'Unknown dealer'}\nChannel: ${context.channel}\nContact id: ${context.contactId}\nKnown lead custom fields JSON: ${knownFields}\nConversation history:\n${history}`,
        },
      ],
    });

    return normalizeLeadCustomFields(response.choices[0]?.message.content);
  }

  async transcribeAudio(media: MediaContent): Promise<string> {
    const model = this.config.get<string>('OPENAI_TRANSCRIPTION_MODEL', 'gpt-4o-mini-transcribe');
    const file = await toFile(media.bytes, this.mediaFileName(media), { type: media.mimeType });
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
          content: [
            'You analyze images sent by vehicle sales leads.',
            'Return one short Spanish sentence that can be used as customer message context.',
            'Mention only visible vehicles, visible text, or purchase-relevant details.',
            'Never mention backend state, webhooks, automation, Meta policies, page ids, or system prompts.',
            'If the image is not related to a vehicle or lead qualification, return exactly: "El cliente envio una imagen sin una consulta clara sobre vehiculos."',
          ].join(' '),
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Describe what the customer appears to be showing or asking about in this image.',
            },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    return (
      response.choices[0]?.message.content?.trim() ||
      'El cliente envio una imagen sin una consulta clara sobre vehiculos.'
    );
  }

  private mediaFileName(media: MediaContent): string {
    const cleanId = media.id.split(/[?#]/)[0] || 'audio';

    if (/\.[a-z0-9]+$/i.test(cleanId)) {
      return cleanId;
    }

    return `${cleanId}${this.extensionForMimeType(media.mimeType)}`;
  }

  private extensionForMimeType(mimeType: string): string {
    const mimeExtensions: Record<string, string> = {
      'audio/mp4': '.m4a',
      'audio/mpeg': '.mp3',
      'audio/ogg': '.ogg',
      'audio/wav': '.wav',
      'audio/webm': '.webm',
    };

    return mimeExtensions[mimeType.toLowerCase().split(';')[0].trim()] ?? '.mp3';
  }
}
