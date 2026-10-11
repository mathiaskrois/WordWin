"""Build and sign the Safari import shortcut on macOS; no paid account needed."""
import pathlib
import plistlib
import subprocess
import tempfile
import uuid

ROOT = pathlib.Path(__file__).resolve().parent.parent
actions = []


def action(name, **parameters):
    identifier = str(uuid.uuid4()).upper()
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions." + name,
        "WFWorkflowActionParameters": {"UUID": identifier, **parameters},
    })
    return identifier


def output(identifier, name):
    return {"Type": "ActionOutput", "OutputUUID": identifier, "OutputName": name}


def token(value):
    return {"WFSerializationType": "WFTextTokenAttachment", "Value": value}


action("comment", WFCommentActionText=(
    "Run from WordWin's Share menu in Safari. Select one screenshot. "
    "The image stays on-device. Delete Photos runs only after WordWin "
    "confirms it has decoded and received the image, before recognition finishes. "
    "Keep the deletion confirmation enabled. If import fails, the photo is kept."
))
photo = action("selectphoto", WFSelectMultiplePhotos=False)
png = action("image.convert", WFImageFormat="PNG", WFInput=token(output(photo, "Photos")))
encoded = action("base64encode", WFEncodeMode="Encode", WFBase64LineBreakMode="None",
                 WFInput=token(output(png, "Converted Image")))
script = (ROOT / "public/shortcuts/import.js").read_text()
placeholder = "WORDWIN_IMAGE_BASE64"
# Insert the variable into the quoted value, leaving the comment intact.
offset = script.index('"' + placeholder + '"') + 1
script = script[:offset] + "\ufffc" + script[offset + len(placeholder):]
javascript = action("runjavascriptonwebpage",
    WFInput=token({"Type": "ExtensionInput"}),
    WFJavaScript={"WFSerializationType": "WFTextTokenString", "Value": {
        "string": script,
        "attachmentsByRange": {f"{{{offset}, 1}}": output(encoded, "Base64 Encoded")},
    }})
group = str(uuid.uuid4()).upper()
action("conditional", WFControlFlowMode=0, GroupingIdentifier=group,
       WFInput=token(output(javascript, "JavaScript Result")), WFCondition=4,
       WFConditionalActionString="WORDWIN_RECEIVED")
action("deletephotos", WFInput=token(output(photo, "Photos")))
action("conditional", WFControlFlowMode=1, GroupingIdentifier=group)
action("showresult", Text=token(output(javascript, "JavaScript Result")))
action("conditional", WFControlFlowMode=2, GroupingIdentifier=group)
workflow = {
    "WFWorkflowName": "WordWin Import and Delete",
    "WFWorkflowClientVersion": "3036.0.4",
    "WFWorkflowMinimumClientVersion": 900,
    "WFWorkflowMinimumClientVersionString": "900",
    "WFWorkflowIcon": {"WFWorkflowIconStartColor": 4282601983, "WFWorkflowIconGlyphNumber": 59511},
    "WFWorkflowTypes": ["ActionExtension"],
    "WFWorkflowInputContentItemClasses": ["WFSafariWebPageContentItem"],
    "WFWorkflowImportQuestions": [],
    "WFWorkflowActions": actions,
}
destination = ROOT / "public/shortcuts/WordWin Import and Delete.shortcut"
with tempfile.TemporaryDirectory() as directory:
    source = pathlib.Path(directory) / "WordWin.shortcut"
    source.write_bytes(plistlib.dumps(workflow, fmt=plistlib.FMT_BINARY))
    subprocess.run(["shortcuts", "sign", "--mode", "anyone", "--input", str(source),
                    "--output", str(destination)], check=True)
print(destination)
