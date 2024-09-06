import SwaggerUI from "swagger-ui";
import "swagger-ui/dist/swagger-ui.css";
import "swagger-themes/themes/dark.css";

SwaggerUI({
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, unicorn/prefer-module
    spec:   require("../openapi.yaml"),
    dom_id: "#swagger-ui"
});
