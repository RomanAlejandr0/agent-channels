import { test, expect } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { randomUUID } from "node:crypto";
const password = "Solo-para-la-prueba-2026";
test("dark Next messenger supports two people, channels, connections and mobile", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Crea tu espacio" }),
  ).toBeVisible();
  await page.getByLabel("Tu nombre").fill("Román");
  await page.getByLabel("Correo electrónico").fill("owner@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Crear espacio", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Crear canal", exact: true })
    .first()
    .click();
  await page.getByLabel("Nombre del canal").fill("proyecto-piloto");
  await page.getByLabel("Descripción").fill("Prueba real de mensajería");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crear canal", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "proyecto-piloto", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Opciones del canal" }).click();
  await page.getByRole("menuitem", { name: "Conexiones", exact: true }).click();
  await page.getByLabel("Nombre del agente").fill("Atlas");
  await page
    .getByRole("button", { name: "Registrar agente", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Revocar Atlas", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Generar credencial", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Conectar Atlas" }),
  ).toBeVisible();
  await expect(page.locator(".secret-text")).not.toBeEmpty();
  const token = await page.locator(".secret-text").innerText();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page
    .getByRole("button", { name: "Participantes", exact: true })
    .click();
  await page.getByLabel("Permiso de Atlas").selectOption("write");
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByRole("button", { name: "Opciones del canal" }).click();
  await page
    .getByRole("menuitem", { name: "Invitar a una persona", exact: true })
    .click();
  await page.getByLabel("Correo electrónico").fill("friend@example.test");
  await page
    .getByRole("button", { name: "Crear invitación", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Invitación creada", exact: true }),
  ).toBeVisible();
  const invite = await page.locator(".secret-text").innerText();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  const second = await browser.newContext(),
    friend = await second.newPage();
  friend.on("pageerror", (e) => errors.push(e.message));
  await friend.goto(invite);
  await friend.getByLabel("Tu nombre").fill("Alex");
  await friend.getByLabel("Correo electrónico").fill("friend@example.test");
  await friend.getByLabel("Contraseña", { exact: true }).fill(password);
  await friend
    .getByRole("button", { name: "Aceptar invitación", exact: true })
    .click();
  await expect(
    friend.getByRole("heading", { name: "proyecto-piloto", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Mensaje", exact: true })
    .fill("¿Revisamos los controles del proyecto?");
  await page
    .getByRole("button", { name: "Enviar mensaje", exact: true })
    .click();
  await expect(
    page.getByText("¿Revisamos los controles del proyecto?", { exact: true }),
  ).toBeVisible();
  await expect(
    friend.getByText("¿Revisamos los controles del proyecto?", { exact: true }),
  ).toBeVisible({ timeout: 12000 });
  const client = new Client({ name: "next-ui-mcp-probe", version: "1" });
  const origin = new URL(page.url()).origin;
  await client.connect(
    new StreamableHTTPClientTransport(new URL(origin + "/mcp"), {
      requestInit: { headers: { Authorization: "Bearer " + token } },
    }),
  );
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError).toBeFalsy();
    return JSON.parse((result.content as any)[0].text);
  };
  const channels = await call("list_channels");
  expect(channels[0].name).toBe("proyecto-piloto");
  const inbox = await call("get_inbox");
  expect(inbox.messages.length).toBeGreaterThan(0);
  await call("ack_messages", {
    message_ids: inbox.messages.map((m: any) => m.id),
  });
  await call("post_message", {
    channel_id: channels[0].id,
    body: "Prueba completada. El giro responde mejor y no encontré errores.",
    operation_id: randomUUID(),
  });
  await client.close();
  await expect(
    page.getByText(
      "Prueba completada. El giro responde mejor y no encontré errores.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 12000 });

  await friend.getByRole("button", { name: "Responder a Román" }).click();
  await friend
    .getByRole("textbox", { name: "Mensaje", exact: true })
    .fill("Sí. El giro responde mejor; voy a comprobar el frenado.");
  await friend
    .getByRole("button", { name: "Enviar mensaje", exact: true })
    .click();
  await expect(
    page.getByText("Sí. El giro responde mejor; voy a comprobar el frenado.", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 12000 });
  await page.getByRole("button", { name: "Opciones del canal" }).click();
  await page
    .getByRole("menuitem", { name: "Pausar canal", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Mensaje", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Opciones del canal" }).click();
  await page
    .getByRole("menuitem", { name: "Reanudar canal", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Mensaje", exact: true }),
  ).toBeEnabled();
  expect(
    await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(23, 24, 27)");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).not.toBeVisible();
  await page.screenshot({
    path: "test-results/next-desktop.png",
    animations: "disabled",
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/next-mobile.png",
    animations: "disabled",
    fullPage: false,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Abrir canales" }).click();
  await expect(page.getByRole("navigation", { name: "Canales" })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Canales" })
    .getByRole("button", { name: "proyecto-piloto", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Mensaje", exact: true }),
  ).toBeVisible();
  await second.close();
  expect(errors).toEqual([]);
});
