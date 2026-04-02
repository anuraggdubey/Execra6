import { consumeOAuthState, getGitHubOAuthConfig } from "@/lib/githubAuth"

function escapeForHtml(value: string) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
}

function popupResponse(payload: Record<string, unknown>) {
    const serialized = JSON.stringify(payload).replace(/</g, "\\u003c")

    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>GitHub Connection</title>
  </head>
  <body style="font-family: sans-serif; padding: 24px; background: #111; color: #f5f5f5;">
    <p>Finalizing GitHub connection…</p>
    <script>
      const payload = ${serialized};
      if (window.opener) {
        window.opener.postMessage(payload, window.location.origin);
        window.close();
      }
      document.body.innerHTML = "<p>${escapeForHtml(String(payload.message ?? "You can close this window."))}</p>";
    </script>
  </body>
</html>`

    return new Response(html, {
        headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
        },
    })
}

export async function GET(req: Request) {
    const url = new URL(req.url)
    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")
    const error = url.searchParams.get("error")
    const errorDescription = url.searchParams.get("error_description")
    const config = getGitHubOAuthConfig()

    if (error) {
        return popupResponse({
            type: "execra:github-oauth",
            success: false,
            message: errorDescription ?? error,
        })
    }

    if (!config.configured || !config.clientId || !config.clientSecret) {
        return popupResponse({
            type: "execra:github-oauth",
            success: false,
            message: "GitHub OAuth is not configured.",
        })
    }

    if (!code || !state) {
        return popupResponse({
            type: "execra:github-oauth",
            success: false,
            message: "GitHub did not return a valid OAuth payload.",
        })
    }

    const oauthState = await consumeOAuthState(state)
    if (!oauthState?.walletAddress) {
        return popupResponse({
            type: "execra:github-oauth",
            success: false,
            message: "GitHub OAuth state validation failed.",
        })
    }

    const response = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code,
            redirect_uri: config.callbackUrl,
        }),
        cache: "no-store",
    })

    if (!response.ok) {
        return popupResponse({
            type: "execra:github-oauth",
            success: false,
            message: "GitHub token exchange failed.",
        })
    }

    const payload = await response.json()
    if (!payload.access_token || typeof payload.access_token !== "string") {
        return popupResponse({
            type: "execra:github-oauth",
            success: false,
            message: payload.error_description ?? "GitHub did not return an access token.",
        })
    }

    return popupResponse({
        type: "execra:github-oauth",
        success: true,
        walletAddress: oauthState.walletAddress,
        accessToken: payload.access_token,
        message: "GitHub connected. You can close this window.",
    })
}
