// Konstanta
const SHEET_NAME = 'Form Responses 1';
const PETUGAS_SHEET_NAME = 'Petugas';

// Fungsi untuk menangani permintaan GET
function doGet() {
  console.log('doGet dipanggil');
  try {
    const template = HtmlService.createTemplateFromFile('index');
    console.log('Template berhasil dibuat');
    const evaluated = template.evaluate();
    console.log('Template berhasil dievaluasi');
    const output = evaluated
      .setTitle('Scanner QR Code')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    console.log('Output berhasil dikonfigurasi');
    return output;
  } catch (error) {
    console.error('Error in doGet:', error);
    return HtmlService.createHtmlOutput('Error: ' + error.toString());
  }
}

// Fungsi untuk memverifikasi petugas
function verifyPetugas(username, password) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const petugasSheet = ss.getSheetByName(PETUGAS_SHEET_NAME);
    
    if (!petugasSheet) {
      return { success: false, message: 'Sheet petugas tidak ditemukan' };
    }
    
    const data = petugasSheet.getDataRange().getValues();
    const headers = data[0];
    const usernameCol = headers.indexOf('Username');
    const passwordCol = headers.indexOf('Password');
    
    if (usernameCol === -1 || passwordCol === -1) {
      return { success: false, message: 'Format sheet petugas tidak valid' };
    }
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][usernameCol] === username && data[i][passwordCol] === password) {
        return { success: true };
      }
    }
    
    return { success: false, message: 'Username atau password salah' };
  } catch (error) {
    console.error('Error in verifyPetugas:', error);
    return { success: false, message: error.toString() };
  }
}

// Fungsi untuk menyimpan QR ID dan gambar
function saveQRData(sheet, row, col, qrId, qrData, qrCodeUrl) {
  const cell = sheet.getRange(row, col);
  
  // Simpan ID sebagai nilai sel
  cell.setValue(qrId);
  
  // Simpan data lengkap sebagai catatan
  cell.setNote(JSON.stringify(qrData));
  
  // Tampilkan QR Code sebagai gambar
  cell.setFormula(`=IMAGE("${qrCodeUrl}")`);
  
  // Set tinggi baris
  sheet.setRowHeight(row, 150);
}

// Fungsi untuk menangani submit form
function onFormSubmit(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSheet();
    const lastRow = sheet.getLastRow();
    const data = sheet.getRange(lastRow, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Mencari indeks kolom yang diperlukan
    const emailCol = headers.indexOf('Email Address');
    const namaCol = headers.indexOf('Nama');
    const noTelpCol = headers.indexOf('Nomor telepon');
    const alamatCol = headers.indexOf('Alamat');
    const qrIdCol = headers.indexOf('QR ID');
    const qrImageCol = headers.indexOf('QR Image');
    
    // Validasi kolom yang diperlukan
    if (emailCol === -1 || namaCol === -1 || noTelpCol === -1 || alamatCol === -1 || qrIdCol === -1 || qrImageCol === -1) {
      console.error('Kolom yang diperlukan tidak ditemukan:', {
        emailCol,
        namaCol,
        noTelpCol,
        alamatCol,
        qrIdCol,
        qrImageCol
      });
      throw new Error('Format sheet tidak valid - kolom tidak lengkap');
    }
    
    // Generate QR ID unik dan data QR
    const qrId = Utilities.getUuid().slice(0, 8);
    const qrData = {
      id: qrId,
      nama: data[namaCol],
      email: data[emailCol],
      noTelp: data[noTelpCol],
      alamat: data[alamatCol],
      timestamp: new Date().toISOString()
    };
    
    // Simpan QR ID sebagai teks biasa (bukan formula)
    sheet.getRange(lastRow, qrIdCol + 1).setValue(qrId);
    
    // Buat QR Code URL
    const qrCodeUrl = "https://api.qrserver.com/v1/create-qr-code/?" +
                     "size=300x300" +
                     "&data=" + encodeURIComponent(JSON.stringify(qrData));
    
    // Simpan QR Image sebagai formula IMAGE di kolom terpisah
    sheet.getRange(lastRow, qrImageCol + 1).setFormula(`=IMAGE("${qrCodeUrl}")`);
    
    // Set tinggi baris agar QR Code terlihat
    sheet.setRowHeight(lastRow, 150);
    
    // Kirim email
    const htmlBody = generateEmailTemplate(qrData.nama, qrCodeUrl);
    
    GmailApp.sendEmail(
      qrData.email,
      'QR Code Pendaftaran',
      'Silakan buka email ini dalam format HTML untuk melihat QR Code',
      {
        htmlBody: htmlBody,
        name: 'Sistem Pendaftaran'
      }
    );
    
    console.log('Email berhasil dikirim ke:', qrData.email);
    
  } catch (error) {
    console.error('Error in onFormSubmit:', error);
    throw error;
  }
}

// Fungsi untuk mendapatkan data pengunjung berdasarkan QR code
function getVisitorData(qrData) {
  try {
    console.log('getVisitorData called with:', JSON.stringify(qrData));
    
    // Validasi input
    if (!qrData || !qrData.id) {
      return { 
        success: false, 
        message: 'Data QR Code tidak valid',
        debug: { receivedData: qrData }
      };
    }

    // Dapatkan spreadsheet aktif
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Form Responses 1');
    
    if (!sheet) {
      return {
        success: false,
        message: 'Sheet Form Responses 1 tidak ditemukan',
        debug: {
          availableSheets: ss.getSheets().map(s => s.getName())
        }
      };
    }

    // Dapatkan semua data
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      return {
        success: false,
        message: 'Belum ada data pendaftaran',
        debug: { rowCount: data.length }
      };
    }

    // Dapatkan header dan validasi kolom yang diperlukan
    const headers = data[0];
    const columnIndexes = {
      timestamp: 0,
      email: headers.indexOf('Email Address'),
      nama: headers.indexOf('Nama'),
      noTelp: headers.indexOf('Nomor telepon'),
      alamat: headers.indexOf('Alamat'),
      qrId: headers.indexOf('QR ID'),
      status: headers.indexOf('Status Kehadiran')
    };

    console.log('Column indices:', columnIndexes);

    // Validasi kolom yang diperlukan
    const requiredColumns = ['email', 'nama', 'noTelp', 'alamat', 'qrId'];
    const missingColumns = requiredColumns.filter(col => columnIndexes[col] === -1);
    
    if (missingColumns.length > 0) {
      return {
        success: false,
        message: 'Format sheet tidak valid - kolom tidak lengkap',
        debug: {
          missingColumns,
          foundColumns: headers
        }
      };
    }

    // Cari data pengunjung
    const searchId = String(qrData.id).trim();
    console.log('Searching for QR ID:', searchId);

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const storedId = String(row[columnIndexes.qrId] || '').trim();
      
      if (storedId === searchId) {
        // Cek status kehadiran
        if (columnIndexes.status !== -1 && row[columnIndexes.status] === 'Hadir') {
          return {
            success: false,
            message: 'QR Code sudah digunakan',
            debug: {
              rowIndex: i + 1,
              status: row[columnIndexes.status]
            }
          };
        }

        // Data ditemukan
        const visitorData = {
          rowIndex: i + 1,
          timestamp: row[columnIndexes.timestamp],
          email: row[columnIndexes.email],
          nama: row[columnIndexes.nama],
          noTelp: row[columnIndexes.noTelp],
          alamat: row[columnIndexes.alamat],
          qrId: storedId
        };

        console.log('Found visitor data:', visitorData);
        return {
          success: true,
          data: visitorData,
          message: 'Data pengunjung ditemukan'
        };
      }
    }

    // Data tidak ditemukan, tapi jika ada data dari URL, gunakan itu
    if (qrData.nama && qrData.email && qrData.noTelp && qrData.alamat) {
      return {
        success: true,
        data: {
          ...qrData,
          rowIndex: null
        },
        message: 'Data dari QR Code URL'
      };
    }

    return {
      success: false,
      message: 'Data pengunjung tidak ditemukan',
      debug: {
        searchedId: searchId,
        totalRows: data.length - 1
      }
    };

  } catch (error) {
    console.error('Error in getVisitorData:', error);
    return {
      success: false,
      message: 'Terjadi kesalahan sistem: ' + error.toString(),
      debug: {
        error: error.toString(),
        stack: error.stack
      }
    };
  }
}

// Fungsi untuk mencatat kehadiran
function recordAttendance(visitorData) {
  try {
    console.log('recordAttendance called with:', JSON.stringify(visitorData));
    
    if (!visitorData || !visitorData.qrId) {
      throw new Error('Data pengunjung tidak valid');
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Form Responses 1');
    
    if (!sheet) {
      throw new Error('Sheet Form Responses 1 tidak ditemukan');
    }
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const statusCol = headers.indexOf('Status Kehadiran') + 1;
    const waktuHadirCol = headers.indexOf('Waktu Kehadiran') + 1;
    
    if (statusCol === 0 || waktuHadirCol === 0) {
      throw new Error('Kolom status atau waktu kehadiran tidak ditemukan');
    }

    // Jika tidak ada rowIndex, cari berdasarkan QR ID
    let rowIndex = visitorData.rowIndex;
    if (!rowIndex) {
      const data = sheet.getDataRange().getValues();
      const qrIdCol = headers.indexOf('QR ID');
      
      if (qrIdCol === -1) {
        throw new Error('Kolom QR ID tidak ditemukan');
      }

      for (let i = 1; i < data.length; i++) {
        if (String(data[i][qrIdCol]).trim() === String(visitorData.qrId).trim()) {
          rowIndex = i + 1;
          break;
        }
      }

      if (!rowIndex) {
        throw new Error('Data pengunjung tidak ditemukan di database');
      }
    }
    
    // Update status dan waktu kehadiran
    const now = new Date();
    const timeZone = Session.getScriptTimeZone();
    const formattedDate = Utilities.formatDate(now, timeZone, "dd/MM/yyyy HH:mm:ss");
    
    // Pastikan kolom waktu kehadiran menggunakan format teks
    const waktuHadirRange = sheet.getRange(rowIndex, waktuHadirCol);
    waktuHadirRange.setNumberFormat("@");
    waktuHadirRange.setValue(formattedDate);
    
    // Update status kehadiran
    const statusRange = sheet.getRange(rowIndex, statusCol);
    statusRange.setValue('Hadir');
    
    // Flush semua perubahan
    SpreadsheetApp.flush();
    
    return { 
      success: true, 
      message: 'Kehadiran berhasil dicatat',
      data: {
        status: 'Hadir',
        waktu: formattedDate
      }
    };
  } catch (error) {
    console.error('Error in recordAttendance:', error);
    return {
      success: false,
      message: error.toString(),
      debug: { error: error.toString() }
    };
  }
}

// Fungsi untuk setup kolom kehadiran
function setupSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    throw new Error('Sheet responses tidak ditemukan');
  }
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  // Tambah kolom QR ID jika belum ada
  if (headers.indexOf('QR ID') === -1) {
    sheet.insertColumnAfter(sheet.getLastColumn());
    sheet.getRange(1, sheet.getLastColumn()).setValue('QR ID');
  }
  
  // Tambah kolom Status Kehadiran jika belum ada
  if (headers.indexOf('Status Kehadiran') === -1) {
    sheet.insertColumnAfter(sheet.getLastColumn());
    sheet.getRange(1, sheet.getLastColumn()).setValue('Status Kehadiran');
  }
  
  // Tambah kolom Waktu Kehadiran jika belum ada
  if (headers.indexOf('Waktu Kehadiran') === -1) {
    sheet.insertColumnAfter(sheet.getLastColumn());
    sheet.getRange(1, sheet.getLastColumn()).setValue('Waktu Kehadiran');
  }
}

// Template email
function generateEmailTemplate(nama, qrCodeUrl) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2c3e50; margin-bottom: 20px;">Terima kasih ${nama} telah mendaftar!</h2>
      
      <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
        <p style="font-size: 16px; color: #34495e;">Berikut adalah QR Code Anda:</p>
        <div style="text-align: center; background-color: white; padding: 20px; border-radius: 5px;">
          <img src="${qrCodeUrl}" alt="QR Code" width="300" height="300" style="display: block; margin: 0 auto;">
        </div>
        <p style="font-size: 14px; color: #666; text-align: center; margin-top: 10px;">
          <a href="${qrCodeUrl}" target="_blank">Klik di sini jika QR Code tidak muncul</a>
        </p>
      </div>
      
      <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px;">
        <p style="margin: 5px 0; color: #e74c3c;"><strong>Penting:</strong></p>
        <p style="margin: 5px 0;">• Simpan QR Code ini dengan baik</p>
        <p style="margin: 5px 0;">• Tunjukkan kepada petugas saat registrasi</p>
        <p style="margin: 5px 0;">• Jika ada masalah dengan QR Code, silakan hubungi admin</p>
      </div>
    </div>
  `;
}

// Fungsi untuk setup kolom yang diperlukan
function setupRequiredColumns() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  // Daftar kolom yang diperlukan
  const requiredColumns = [
    'QR ID',
    'Status Kehadiran',
    'Waktu Kehadiran'
  ];
  
  // Tambahkan kolom yang belum ada
  requiredColumns.forEach(columnName => {
    if (headers.indexOf(columnName) === -1) {
      sheet.insertColumnAfter(sheet.getLastColumn());
      sheet.getRange(1, sheet.getLastColumn()).setValue(columnName);
    }
  });
}