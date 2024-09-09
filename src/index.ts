import SwaggerUI from "swagger-ui";
import "swagger-ui/dist/swagger-ui.css";
import "swagger-themes/themes/dark.css";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare function plausible(event: string, properties?: { props: Record<string, string>; }): void;

function addEvent(selector: string, event: string, properties: (element: Element) => Record<string, string>): void {
    const items = Array.from(document.querySelectorAll(selector));
    for (const item of items) {
        const props = properties(item);
        item.classList.add(`plausible-event-name=${event.replaceAll(" ", "+")}`);
        for (const [key, value] of Object.entries(props)) {
            item.classList.add(`plausible-event-${key}=${value.replaceAll(" ", "+")}`);
        }
    }
}

SwaggerUI({
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, unicorn/prefer-module
    spec:   require("../openapi.yaml"),
    dom_id: "#swagger-ui",
    onComplete() {
        addEvent("button.opblock-summary-control", "Toggle Endpoint", element => ({ endpoint: element.querySelector(".opblock-summary-description")!.textContent! }));
        addEvent(".btn.authorize ", "Open Authorize", () => ({}));
        addEvent(".json-schema-2020-12-accordion", "Toggle Schema", element => ({ schema: element.querySelector(".json-schema-2020-12__title")!.textContent! }));
        addEvent(".json-schema-2020-12-expand-deep-button", "Toggle Schema", element => ({ schema: element.parentNode!.querySelector(".json-schema-2020-12__title")!.textContent! }));
    },
    supportedSubmitMethods: ["get", "head"],
    validatorUrl:           "none"
});
