from .models import PermissionClass
from .tooling import ToolDefinition


class PolicyGate:
    def allows(self, tool: ToolDefinition, explicitly_approved: bool = False) -> bool:
        return tool.permission in {PermissionClass.READ_ONLY, PermissionClass.REVERSIBLE_WRITE} or explicitly_approved
