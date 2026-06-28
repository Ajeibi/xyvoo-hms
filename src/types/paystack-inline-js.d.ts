declare module "@paystack/inline-js" {
  export default class PaystackPop {
    newTransaction(options: {
      key: string;
      email: string;
      amount: number;
      reference?: string;
      accessCode?: string;
      onSuccess?: (transaction: { reference: string }) => void;
      onCancel?: () => void;
    }): void;
  }
}
