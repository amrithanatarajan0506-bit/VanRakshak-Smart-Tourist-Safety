from io import BytesIO

import pytest
from pypdf import PdfWriter

from services.document_validation import DocumentError, validate_aadhaar_number, validate_id_file
from services.identity_service import verify_aadhaar, verify_passport


def test_aadhaar_accepts_valid_number_and_formatting():
    assert validate_aadhaar_number("2345 6789-0124") == "234567890124"
    assert verify_aadhaar("2345 6789-0124")["status"] == "verified"


def test_aadhaar_rejects_invalid_checksum():
    with pytest.raises(DocumentError, match="check it"):
        validate_aadhaar_number("234567890125")


def test_passport_number_format_is_validated():
    assert verify_passport("AB123456", "XX")["status"] == "verified"
    with pytest.raises(ValueError, match="format"):
        verify_passport("12345678", "XX")


def test_small_valid_pdf_is_accepted():
    writer = PdfWriter()
    writer.add_blank_page(width=400, height=250)
    pdf = BytesIO()
    writer.write(pdf)

    data = pdf.getvalue()
    assert len(data) < 20 * 1024
    assert validate_id_file(data) == "pdf"