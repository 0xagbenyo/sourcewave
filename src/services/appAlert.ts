type AppAlertButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

type ShowAlertFn = (title: string, message?: string, buttons?: AppAlertButton[]) => void;

let showAlertImpl: ShowAlertFn | null = null;

export function bindAppAlert(fn: ShowAlertFn | null) {
  showAlertImpl = fn;
}

function fallbackAlert(title: string, message?: string) {
  if (typeof console !== 'undefined') {
    console.warn('[appAlert] alert host unavailable:', title, message || '');
  }
}

export const appAlert = {
  alert(title: string, message?: string, buttons?: AppAlertButton[]) {
    if (showAlertImpl) {
      showAlertImpl(title, message, buttons);
      return;
    }
    fallbackAlert(title, message);
  },
};

export type { AppAlertButton };
