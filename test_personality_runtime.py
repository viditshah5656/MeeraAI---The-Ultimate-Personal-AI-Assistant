from personality_runtime import (
    KnowledgeItem, KnowledgeSnapshot, PersonalityLifecycle, PersonalityRuntime,
    RuntimeContext, default_personalities, make_personality,
)


def test_activation_builds_structured_role_and_context():
    runtime = PersonalityRuntime(default_personalities())
    activation = runtime.activate("coding-agent", PersonalityLifecycle.PROJECT, project_id="demo")

    assert activation.state.value == "active"
    context = runtime.assemble_context(RuntimeContext(
        user_request="fix the login bug",
        project_context="package.json says this project uses pytest",
        memories=("Project uses pytest.",),
    ))
    assert "ACTIVE ROLE: Coding Agent" in context
    assert "Verification: run the narrowest relevant check" in context
    assert "PROJECT CONTEXT (untrusted reference)" in context
    assert "Project uses pytest." in context


def test_activation_detection_and_exit_are_natural():
    runtime = PersonalityRuntime(default_personalities())
    assert runtime.detect_activation("Become my IELTS teacher") == "ielts-teacher"
    assert runtime.detect_activation("Switch to coding mode") == "coding-agent"
    runtime.activate("ielts-teacher")
    runtime.exit()
    assert [role.id for role in runtime.active_stack()] == ["coding-agent"]
    assert runtime.detect_activation("Exit IELTS mode") is None


def test_custom_roles_and_versioned_knowledge_remain_structured():
    role = make_personality(
        "Security Reviewer",
        "security review",
        "find exploitable defects before approval",
        knowledge=KnowledgeSnapshot(
            version=2,
            items=(KnowledgeItem("The project requires tests before approval", source="project-policy"),),
            sources=("project-policy",),
        ),
    )
    runtime = PersonalityRuntime()
    runtime.register(role)
    runtime.activate(role.id)
    assert runtime.active_stack()[0].knowledge.version == 2
    assert runtime.active_stack()[0].knowledge.items[0].source == "project-policy"


def test_role_context_includes_retrieved_knowledge_facts():
    runtime = PersonalityRuntime(default_personalities())
    runtime.activate("ielts-teacher")
    context = runtime.assemble_context(RuntimeContext(
        user_request="band criteria", knowledge_facts=("Use official band descriptors.",)
    ))
    assert "ROLE KNOWLEDGE (versioned reference)" in context
    assert "Use official band descriptors." in context