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
  }
}

const keycloak = new Keycloak({
  url: KEYCLOAK_URL,
  realm: "cockpit",
  clientId: "cockpit-ui"
});

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

keycloak
  .init({
    onLoad: "login-required"
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
