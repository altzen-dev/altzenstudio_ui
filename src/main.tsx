import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import Keycloak from "keycloak-js";
import App from "./app/App.tsx";
import { store } from "./app/store";
import { KEYCLOAK_URL } from "./app/config";
import "./styles/index.css";

declare global {
  interface Window {
    getAccessToken?: () => Promise<string | null>;
    getUserName?: () => string | null;
    logout?: () => Promise<void>;
  }
}

const keycloak = new Keycloak({
  url: KEYCLOAK_URL,
  realm: "cockpit",
  clientId: "cockpit-ui"
});

function ensureWebCryptoCompatibility() {
  if (typeof window.crypto === "undefined") {
    throw new Error(
      "Web Crypto API is not available. Serve this app over HTTPS (or localhost) and use a modern browser."
    );
  }

  if (typeof window.crypto.randomUUID !== "function" && typeof window.crypto.getRandomValues === "function") {
    const randomUUID = () => {
      const bytes = window.crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;

      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
      return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
        .slice(6, 8)
        .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
    };

    Object.defineProperty(window.crypto, "randomUUID", {
      value: randomUUID,
      configurable: true,
      writable: true
    });
  }
}


function installAuthenticatedFetch(authClient: Keycloak) {
  
  const originalFetch = window.fetch.bind(window);

  window.getAccessToken = async () => {
    try {
      await authClient.updateToken(30);
    } catch (error) {
      console.error("Failed to refresh Keycloak token.", error);
    }

    return authClient.token ?? null;
  };

  window.getUserName = () => {
    const parsed = authClient.tokenParsed as { preferred_username?: string; name?: string } | undefined;
    const preferredUserName = parsed?.preferred_username?.trim();
    if (preferredUserName) {
      return preferredUserName;
    }

    const fullName = parsed?.name?.trim();
    return fullName && fullName.length > 0 ? fullName : null;
  };

  window.logout = async () => {
    await authClient.logout({
      redirectUri: window.location.origin
    });
  };

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const token = await window.getAccessToken?.();
    const headers = new Headers(init?.headers);

    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    if (input instanceof Request) {
      const mergedHeaders = new Headers(input.headers);
      headers.forEach((value, key) => {
        mergedHeaders.set(key, value);
      });

      const authenticatedRequest = new Request(input, {
        ...init,
        headers: mergedHeaders
      });

      return originalFetch(authenticatedRequest);
    }

    return originalFetch(input, {
      ...init,
      headers
    });
  };
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found.");
}

ensureWebCryptoCompatibility();

keycloak
  .init({
    onLoad: "login-required",
    checkLoginIframe: false,
    pkceMethod: false,
    redirectUri: window.location.origin
  })
  .then((authenticated) => {
    if (!authenticated) {
      return;
    }

    installAuthenticatedFetch(keycloak);

    createRoot(rootElement).render(
      <Provider store={store}>
        <App />
      </Provider>
    );
  })
  .catch((error) => {
    console.error("Failed to initialize Keycloak.", error);
  });
