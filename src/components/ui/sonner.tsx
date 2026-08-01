import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Toasts blijven onder de notch / Dynamic Island: de offset telt de
 * veilige zone van iOS mee, ook in PWA-modus.
 */
const SAFE_TOP = "calc(env(safe-area-inset-top, 0px) + 16px)";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="top-center"
      offset={{ top: SAFE_TOP, right: "16px", left: "16px", bottom: "16px" }}
      mobileOffset={{ top: SAFE_TOP, right: "12px", left: "12px", bottom: "12px" }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
