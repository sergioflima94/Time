import Constants, { ExecutionEnvironment } from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

import { getGateway } from '@/lib/paymentGateways';
import { isMockMode } from '@/lib/supabase';
import type { PaymentGatewayConnection, SalePaymentIntent } from '@/types';

type NativeContactlessResult = {
  status: 'presented' | 'approved' | 'cancelled';
  externalId?: string;
};

type PeladaContactlessModule = {
  startPayment(input: {
    intentId: string;
    amountCents: number;
    provider: string;
  }): Promise<NativeContactlessResult>;
};

export interface ContactlessReadiness {
  available: boolean;
  demo: boolean;
  message: string;
}

const nativeContactless = NativeModules.PeladaContactless as PeladaContactlessModule | undefined;

/**
 * Tap to Pay é SoftPOS certificado, não leitura NFC genérica. O módulo nativo só
 * existe no development/production build homologado com o PSP escolhido.
 */
export function contactlessReadiness(connection: PaymentGatewayConnection | null | undefined): ContactlessReadiness {
  if (!connection || !connection.contactlessEnabled || !getGateway(connection.provider).contactless) {
    return { available: false, demo: false, message: 'Escolha Mercado Pago ou PicPay com aproximação habilitada.' };
  }
  if (isMockMode) {
    return { available: true, demo: true, message: 'Modo demonstração: o leitor por aproximação será simulado.' };
  }
  if (Platform.OS === 'web') {
    return { available: false, demo: false, message: 'A aproximação funciona somente no aplicativo instalado em Android ou iPhone.' };
  }
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return { available: false, demo: false, message: 'A aproximação não funciona no Expo Go. Instale o build nativo do estabelecimento.' };
  }
  if (!nativeContactless) {
    return { available: false, demo: false, message: 'Este build ainda não contém o SDK SoftPOS homologado pelo gateway.' };
  }
  return { available: true, demo: false, message: 'Leitor por aproximação disponível neste aparelho.' };
}

export async function startContactlessPayment(
  intent: SalePaymentIntent,
  connection: PaymentGatewayConnection,
): Promise<NativeContactlessResult> {
  const readiness = contactlessReadiness(connection);
  if (!readiness.available) throw new Error(readiness.message);
  if (readiness.demo) return { status: 'presented', externalId: intent.externalId ?? undefined };
  if (!nativeContactless) throw new Error('Módulo de aproximação indisponível.');
  return nativeContactless.startPayment({
    intentId: intent.id,
    amountCents: intent.amountCents,
    provider: connection.provider,
  });
}
