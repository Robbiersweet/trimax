from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path.cwd()
OUT_DIR = ROOT / "role-guides"
OUT_DIR.mkdir(exist_ok=True)

TODAY = "May 27, 2026"


ROLE_GUIDES = [
    {
        "file": "Trimax-Owner-Guide.pdf",
        "role": "Owner",
        "subtitle": "Full workspace control for Robbie, Lyubov, or a future business owner.",
        "badge": "Full Access",
        "color": colors.HexColor("#f97316"),
        "summary": (
            "Owners can see and manage every part of a business workspace. Use this role only for people "
            "who should have complete access to company operations, customer records, invoices, payments, "
            "reports, services, settings, and team access."
        ),
        "access": [
            "Dashboard, Queue, Schedule, Estimates, Invoices, Payments, Clients, Services, Reports, Activity, and Settings.",
            "Create, edit, print, export, and review documents.",
            "Invite workspace users and assign roles.",
            "Manage property team access for apartment portals.",
            "Review activity history and business-wide reports.",
        ],
        "workflows": [
            (
                "Start the Day",
                [
                    "Open the dashboard for the correct workspace, such as R&L Creations or Just Kleen.",
                    "Review outstanding revenue, recent invoices, recent queue items, and any schedule attention cards.",
                    "Use the left navigation to move into the area that needs work.",
                ],
            ),
            (
                "Run R&L Apartment Work",
                [
                    "Use Queue for apartment turns, property manager requests, scheduling, remediation, and renovation tracking.",
                    "Create estimates from queue items when the job is ready to price.",
                    "Convert approved estimates into invoices when the work is ready to bill.",
                    "Use split invoice warnings only for apartment paint work that must stay under the approved target amount.",
                ],
            ),
            (
                "Run Just Kleen Work",
                [
                    "Use Clients, Services, Estimates, and Invoices for cleaning customers.",
                    "Use the special spreadsheet-style print/export for 5 Star 5 or Bank of America style billing when needed.",
                    "Keep Just Kleen services and clients inside the Just Kleen workspace.",
                ],
            ),
            (
                "Control Access",
                [
                    "Use Settings to add trusted staff, accountants, or property team users.",
                    "Give property managers access only to the property they should see.",
                    "Use Member as a temporary low-access role until the correct role is decided.",
                ],
            ),
        ],
        "rules": [
            "Always confirm the workspace before entering sensitive data.",
            "Do not give Owner access unless the person should see all business information.",
            "Use the Activity Log as the memory trail for important work.",
            "Before deployment, test both R&L Creations and Just Kleen.",
        ],
    },
    {
        "file": "Trimax-Admin-Guide.pdf",
        "role": "Admin",
        "subtitle": "Trusted office operations access without needing to be the business owner.",
        "badge": "Operations Access",
        "color": colors.HexColor("#2563eb"),
        "summary": (
            "Admins can operate almost the entire workspace. This role is for a trusted helper who can manage "
            "day-to-day queue, client, estimate, invoice, payment, service, report, activity, and settings work."
        ),
        "access": [
            "Dashboard, Queue, Schedule, Estimates, Invoices, Payments, Clients, Services, Reports, Activity, and Settings.",
            "Create and update queue items, estimates, invoices, clients, and services.",
            "Record payments and use batch payment tools.",
            "Review operational reports and activity history.",
        ],
        "workflows": [
            (
                "Daily Operations",
                [
                    "Open the dashboard and review recent queue items, recent invoices, and outstanding balances.",
                    "Move into Queue for apartment turns or into Clients, Estimates, and Invoices for normal customer work.",
                    "Keep notes clear so the owner can understand what changed later.",
                ],
            ),
            (
                "Queue Intake",
                [
                    "Create one queue item for one unit, or paste multiple units when several apartments are submitted at once.",
                    "Fill in move out date, ready date, scheduled date, paint type, flooring, priority, remediation, and renovation fields.",
                    "Review saved renovation history before changing it.",
                ],
            ),
            (
                "Invoices and Payments",
                [
                    "Create invoices directly, or convert from estimates when the work started from an estimate.",
                    "Use Payments when one check covers several invoices.",
                    "Print or export documents only after reviewing the customer, service address, totals, taxes, and line items.",
                ],
            ),
        ],
        "rules": [
            "Do not delete old records unless the owner asks.",
            "Keep R&L and Just Kleen data in their correct workspaces.",
            "Use clear notes for scheduling changes, payment actions, and customer requests.",
            "Ask the owner before changing global settings or user access.",
        ],
    },
    {
        "file": "Trimax-Accountant-Guide.pdf",
        "role": "Accountant",
        "subtitle": "Finance, invoice, client, payment, activity, and reporting access.",
        "badge": "Finance Access",
        "color": colors.HexColor("#16a34a"),
        "summary": (
            "Accountants can review the financial side of the workspace without managing queue operations "
            "or user settings. This role is for bookkeeping, invoice review, payment review, client balance "
            "review, and reports."
        ),
        "access": [
            "Dashboard, Estimates, Invoices, Payments, Clients, Reports, and Activity.",
            "Create and review estimates and invoices.",
            "Record payments and review batch payment history.",
            "Review client balances, aging, revenue, and activity logs.",
        ],
        "workflows": [
            (
                "Review Open Money",
                [
                    "Open the dashboard and review unpaid balances and open invoices.",
                    "Use Invoices for current invoice status, draft balances, aging, and documents ready for payment.",
                    "Use Payments when one check covers more than one invoice.",
                ],
            ),
            (
                "Record a Payment",
                [
                    "Open Payments and search for the customer or invoice group.",
                    "Select the invoices paid by the same check.",
                    "Confirm the total, enter the payment details, and mark the selected invoices paid.",
                ],
            ),
            (
                "Review Reports",
                [
                    "Use Reports for revenue, invoice aging, queue history summaries, and readiness metrics.",
                    "Use Activity to confirm who created or changed important records.",
                    "If a number looks wrong, check the invoice, estimate, and payment records before changing anything.",
                ],
            ),
        ],
        "rules": [
            "Accountants should not need property manager portal access.",
            "Do not change services, user roles, or workspace settings unless asked.",
            "Keep customer financial information private.",
            "When in doubt, leave a note and ask the owner before changing records.",
        ],
    },
    {
        "file": "Trimax-Property-Manager-Guide.pdf",
        "role": "Property Manager",
        "subtitle": "Limited property portal access for Diana, Alana, Allen, and future apartment staff.",
        "badge": "Property Portal",
        "color": colors.HexColor("#7c3aed"),
        "summary": (
            "Property Managers can submit and review queue items for their assigned property and see "
            "property-level reports. They should not see company financials, other clients, other properties, "
            "invoices, admin settings, or internal business tools."
        ),
        "access": [
            "Dashboard, Queue, Schedule, and Reports for the assigned property.",
            "Add one unit or several units to the queue.",
            "Review readiness, schedule, remediation, flooring, paint type, priority, and renovation details.",
            "Run property-level reports without company-wide financial information.",
        ],
        "workflows": [
            (
                "Add Several Units at Once",
                [
                    "Open Queue and choose New Queue Item.",
                    "Enter the property and paste unit numbers separated by commas or on separate lines.",
                    "Fill in shared dates, paint type, flooring, priority, remediation, notes, and renovation information.",
                    "Submit the form. Trimax creates one queue item per unit.",
                ],
            ),
            (
                "Use Renovation Tracking",
                [
                    "If the unit was already renovated, choose Yes for prior renovation and enter details such as Previous PrideRock Reno.",
                    "If the unit now needs renovation, choose Yes for renovation needed and enter what work is needed.",
                    "Trimax keeps this information with the unit history so future reports can show which units were previously renovated and which units still need renovation.",
                ],
            ),
            (
                "Review Status",
                [
                    "Use Queue to see whether a unit is pending estimate, scheduled, completed, or needs attention.",
                    "Use Schedule to review upcoming work dates.",
                    "Use Reports to review property history, readiness, schedule risk, remediation, and renovation information.",
                ],
            ),
        ],
        "rules": [
            "Property Manager access should only show the assigned property.",
            "Do not use this role for R&L or Just Kleen office staff who need invoices or payments.",
            "Submit clear unit notes so the work can be estimated and scheduled correctly.",
            "If a unit belongs to a different property, contact the owner instead of entering it under the wrong property.",
        ],
    },
    {
        "file": "Trimax-Member-Guide.pdf",
        "role": "Member",
        "subtitle": "Minimal access while a user role is still being decided.",
        "badge": "Limited Access",
        "color": colors.HexColor("#64748b"),
        "summary": (
            "Members have very limited access. This role is useful as a temporary starting point when someone "
            "has been invited but should not yet access operational or financial tools."
        ),
        "access": [
            "Dashboard only.",
            "No queue actions, invoice actions, payment actions, reports, services, clients, activity, or settings.",
            "No property portal editing unless the owner changes the role.",
        ],
        "workflows": [
            (
                "First Sign-In",
                [
                    "Sign in using the invite email.",
                    "Confirm the workspace name shown in the app.",
                    "Wait for the owner or admin to assign the correct role before doing work.",
                ],
            ),
            (
                "When More Access Is Needed",
                [
                    "Ask the owner which work you need to do.",
                    "The owner can change your role in Settings.",
                    "After the role changes, sign out and sign back in if the navigation does not update right away.",
                ],
            ),
        ],
        "rules": [
            "Member is not meant for active daily operations.",
            "Do not share your login with another person.",
            "If you see the wrong workspace, stop and contact the owner.",
        ],
    },
]


styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="Kicker",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#f97316"),
        spaceAfter=7,
        uppercase=True,
    )
)
styles.add(
    ParagraphStyle(
        name="TitleLarge",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=30,
        leading=34,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=7,
    )
)
styles.add(
    ParagraphStyle(
        name="Subtitle",
        parent=styles["Normal"],
        fontSize=12,
        leading=17,
        textColor=colors.HexColor("#475569"),
        spaceAfter=16,
    )
)
styles.add(
    ParagraphStyle(
        name="SectionHeading",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=18,
        textColor=colors.HexColor("#0f172a"),
        spaceBefore=4,
        spaceAfter=9,
    )
)
styles.add(
    ParagraphStyle(
        name="BodyTrimax",
        parent=styles["BodyText"],
        fontSize=11,
        leading=16,
        textColor=colors.HexColor("#334155"),
        spaceAfter=7,
    )
)
styles.add(
    ParagraphStyle(
        name="HeroText",
        parent=styles["BodyText"],
        fontSize=11.5,
        leading=16,
        textColor=colors.HexColor("#17324d"),
    )
)
styles.add(
    ParagraphStyle(
        name="Footer",
        parent=styles["Normal"],
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#64748b"),
    )
)


def bullets(items):
    story = []
    for item in items:
        story.append(Paragraph(f"&bull; {item}", styles["BodyTrimax"]))
    return story


def numbered(items):
    story = []
    for index, item in enumerate(items, start=1):
        story.append(Paragraph(f"{index}. {item}", styles["BodyTrimax"]))
    return story


def card(title, children, border_color, width):
    data = [[Paragraph(title, styles["SectionHeading"])], children]
    table = Table(data, colWidths=[width])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#d9e2ef")),
                ("LEFTPADDING", (0, 0), (-1, -1), 16),
                ("RIGHTPADDING", (0, 0), (-1, -1), 16),
                ("TOPPADDING", (0, 0), (-1, -1), 13),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 13),
                ("LINEBEFORE", (0, 0), (0, -1), 4, border_color),
            ]
        )
    )
    return table


def add_header_footer(canvas, doc, guide):
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#64748b"))
    canvas.setFont("Helvetica", 8)
    canvas.drawString(
        doc.leftMargin,
        0.48 * inch,
        f"Trimax Operations Platform - {guide['role']} Guide - Generated {TODAY}",
    )
    canvas.drawRightString(
        letter[0] - doc.rightMargin,
        0.48 * inch,
        f"Page {doc.page}",
    )
    canvas.restoreState()


def build_guide(guide):
    pdf_path = OUT_DIR / guide["file"]
    doc = BaseDocTemplate(
        str(pdf_path),
        pagesize=letter,
        leftMargin=0.82 * inch,
        rightMargin=0.82 * inch,
        topMargin=0.78 * inch,
        bottomMargin=0.82 * inch,
        title=f"Trimax {guide['role']} Guide",
    )
    frame = Frame(
        doc.leftMargin,
        doc.bottomMargin + 0.18 * inch,
        doc.width,
        doc.height - 0.18 * inch,
        id="main",
    )
    doc.addPageTemplates(
        [
            PageTemplate(
                id="role",
                frames=[frame],
                onPage=lambda canvas, d: add_header_footer(canvas, d, guide),
            )
        ]
    )

    story = [
        Paragraph("TRIMAX ROLE GUIDE", styles["Kicker"]),
        Paragraph(guide["role"], styles["TitleLarge"]),
        Paragraph(guide["subtitle"], styles["Subtitle"]),
    ]

    hero = Table(
        [
            [
                Paragraph(
                    f"<b>{guide['badge']}</b><br/><br/>{guide['summary']}",
                    styles["HeroText"],
                )
            ]
        ],
        colWidths=[doc.width],
    )
    hero.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#eef6ff")),
                ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#bfdbfe")),
                ("LINEBEFORE", (0, 0), (0, -1), 6, guide["color"]),
                ("LEFTPADDING", (0, 0), (-1, -1), 18),
                ("RIGHTPADDING", (0, 0), (-1, -1), 18),
                ("TOPPADDING", (0, 0), (-1, -1), 16),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 16),
            ]
        )
    )
    story.extend([hero, Spacer(1, 0.18 * inch)])

    story.extend(
        [
            card("What This Role Can Access", bullets(guide["access"]), guide["color"], doc.width),
            Spacer(1, 0.12 * inch),
            card("Important Guardrails", bullets(guide["rules"]), guide["color"], doc.width),
            Spacer(1, 0.12 * inch),
        ]
    )

    for title, items in guide["workflows"]:
        story.append(card(title, numbered(items), guide["color"], doc.width))
        story.append(Spacer(1, 0.12 * inch))

    reminder = Table(
        [
            [
                Paragraph(
                    "<b>Workspace reminder:</b> Trimax supports more than one business. Always confirm you are working in the correct workspace before creating queue items, estimates, invoices, services, payments, or reports.",
                    styles["BodyTrimax"],
                )
            ]
        ],
        colWidths=[doc.width],
    )
    reminder.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#eef6ff")),
                ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#bfdbfe")),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    story.append(reminder)

    doc.build(story)
    return pdf_path


if __name__ == "__main__":
    created = [build_guide(guide) for guide in ROLE_GUIDES]
    for path in created:
        print(path)
