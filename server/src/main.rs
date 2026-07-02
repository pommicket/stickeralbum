use std::error::Error;
use std::net::SocketAddr;
use std::process::ExitCode;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_rusqlite as sqlite;
use tokio_rusqlite::params;

struct Server {
	db: sqlite::Connection,
}

const BAD_REQUEST: &[u8] = b"HTTP/1.1 400 Bad request\r\nConnection: Close\r\nContent-Type: text/plain\r\n\r\nBad request\n";
const ERROR_ACCOUNT_NOT_FOUND: &[u8] = b"HTTP/1.1 404 Not found\r\nConnection: Close\r\nContent-Type: text/plain\r\n\r\nAccount not found.\n";
const ERROR_INVALID_CHARS: &[u8] = b"HTTP/1.1 400 Bad request\r\nConnection: Close\r\nContent-Type: text/plain\r\n\r\nID contains invalid charcaters.\n";
const ERROR_EXISTS: &[u8] = b"HTTP/1.1 400 Bad request\r\nConnection: Close\r\nContent-Type: text/plain\r\n\r\nAccount with this ID already exists (probably).\n";
//const OK_OK: &[u8] = b"HTTP/1.1 200 OK\r\nConnection: Close\r\nContent-Type: text/plain\r\n\r\nOK\n";
const OK_EMPTY: &[u8] = b"HTTP/1.1 200 OK\r\nConnection: Close\r\nContent-Type: text/plain\r\n\r\n";
const STICKER_COUNT: usize = 980;
const PUBLIC_ID_LEN: usize = 12;
// timeout for all requests
const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);

fn is_user_not_found_error<T>(r: &sqlite::Result<T>) -> bool {
	matches!(
		r,
		Err(sqlite::Error::Error(rusqlite::Error::QueryReturnedNoRows))
	)
}
async fn write_ok_with_data(
	stream: &mut tokio::net::TcpStream,
	data: &[u8],
) -> std::io::Result<()> {
	let mut request = vec![0; OK_EMPTY.len() + data.len()];
	request[..OK_EMPTY.len()].copy_from_slice(OK_EMPTY);
	request[OK_EMPTY.len()..].copy_from_slice(data);
	stream.write_all(&request).await?;
	Ok(())
}

impl Server {
	async fn create(&self, password: String) -> sqlite::Result<String> {
		let new_data = vec![0u8; STICKER_COUNT];
		let mut public_id = vec![0u8; PUBLIC_ID_LEN];
		getrandom::fill(&mut public_id).map_err(|_| sqlite::Error::ConnectionClosed)?;
		const CODING: &[u8; 32] = b"abcdefghjkmnpqrstuvwxyz123456789";
		for byte in public_id.iter_mut() {
			*byte = CODING[usize::from(*byte & 31)];
		}
		let public_id_string = String::from_utf8(public_id.clone()).unwrap();
		self.db
			.call(move |conn| {
				conn.execute(
					"INSERT INTO users VALUES (?, ?, ?)",
					params![password, public_id, new_data],
				)
			})
			.await?;
		Ok(public_id_string)
	}
	async fn read_by_password(&self, password: String) -> sqlite::Result<Vec<u8>> {
		let result: Vec<u8> = self
			.db
			.call(move |conn| {
				conn.query_row(
					"SELECT data FROM users WHERE password = ?",
					[password],
					|row| row.get(0),
				)
			})
			.await?;
		if result.len() != STICKER_COUNT {
			return Err(sqlite::Error::ConnectionClosed);
		}
		Ok(result)
	}
	async fn read_by_id(&self, id: String) -> sqlite::Result<Vec<u8>> {
		let result: Vec<u8> = self
			.db
			.call(move |conn| {
				conn.query_row(
					"SELECT data FROM users WHERE publicId = ?",
					[id.as_bytes()],
					|row| row.get(0),
				)
			})
			.await?;
		if result.len() != STICKER_COUNT {
			return Err(sqlite::Error::ConnectionClosed);
		}
		Ok(result)
	}
	async fn write(&self, password: String, data: Vec<u8>) -> sqlite::Result<Vec<u8>> {
		self.db
			.call(move |conn| {
				conn.execute(
					"UPDATE users SET data = ? WHERE password = ?",
					params![&data, password],
				)?;
				Ok(data)
			})
			.await
	}
	async fn get_public_id(&self, password: String) -> sqlite::Result<String> {
		let result: Vec<u8> = self
			.db
			.call(move |conn| {
				conn.query_row(
					"SELECT publicId FROM users WHERE password = ?",
					[password],
					|row| row.get(0),
				)
			})
			.await?;
		if result.len() != PUBLIC_ID_LEN {
			return Err(sqlite::Error::ConnectionClosed);
		}
		String::from_utf8(result).map_err(|_| sqlite::Error::ConnectionClosed)
	}
	async fn try_handle_connection(
		&self,
		stream: &mut tokio::net::TcpStream,
	) -> Result<(), Box<dyn Error>> {
		let mut data = [0; 4096];
		let mut len = 0;
		while len < data.len() {
			let nread = stream.read(&mut data[len..]).await?;
			len += nread;
			if data[len - nread..len].contains(&b'\x7f') {
				break;
			}
		}
		let body_start = data
			.windows(4)
			.position(|x| x == b"\r\n\r\n")
			.ok_or("no request body")?
			+ 4;
		let body = &data[body_start..];
		let body = &body[..body
			.iter()
			.position(|&c| c == b'\x7f')
			.ok_or("no terminator in body")?];
		if body.is_empty() {
			Err("no request body")?;
		}
		match body[0] {
			b'c' => {
				// create account
				let password = std::str::from_utf8(&body[1..])
					.map_err(|_| "password contains invalid UTF-8")?;
				if password.bytes().any(|c| c.is_ascii_control()) {
					stream.write_all(ERROR_INVALID_CHARS).await?;
					return Ok(());
				}
				if !(4..=240).contains(&password.len()) {
					// client should have validated this
					Err("password must be 4-80 characters long")?
				}
				let public_id = match self.create(password.to_owned()).await {
					Err(e) => {
						return if let sqlite::Error::Error(rusqlite::Error::SqliteFailure(e, _)) = e
							&& e.code == rusqlite::ErrorCode::ConstraintViolation
						{
							stream.write_all(ERROR_EXISTS).await?;
							Ok(())
						} else {
							Err(e.into())
						};
					}
					Ok(data) => data,
				};
				write_ok_with_data(stream, public_id.as_bytes()).await?;
			}
			b'r' => {
				// legacy read by password
				let password = std::str::from_utf8(&body[1..])
					.map_err(|_| "password contains invalid UTF-8")?;
				let data = self.read_by_password(password.to_owned()).await;
				if is_user_not_found_error(&data) {
					stream.write_all(ERROR_ACCOUNT_NOT_FOUND).await?;
					return Ok(());
				}
				write_ok_with_data(stream, &data?).await?;
			}
			b'l' => {
				// login
				let password = std::str::from_utf8(&body[1..])
					.map_err(|_| "password contains invalid UTF-8")?;
				let data = self.get_public_id(password.to_owned()).await;
				if is_user_not_found_error(&data) {
					stream.write_all(ERROR_ACCOUNT_NOT_FOUND).await?;
					return Ok(());
				}
				write_ok_with_data(stream, data?.as_bytes()).await?;
			}
			b'R' => {
				// read by public ID
				let id = std::str::from_utf8(&body[1..])
					.map_err(|_| "public ID contains invalid UTF-8")?;
				let data = self.read_by_id(id.to_owned()).await;
				if is_user_not_found_error(&data) {
					stream.write_all(ERROR_ACCOUNT_NOT_FOUND).await?;
					return Ok(());
				}
				write_ok_with_data(stream, &data?).await?;
			}
			b'w' => {
				// write
				let sep = body
					.iter()
					.position(|&c| c == 0x01)
					.ok_or("bad format for w command")?;
				let password = std::str::from_utf8(&body[1..sep])
					.map_err(|_| "password contains invalid UTF-8")?;
				let updates = &body[sep + 1..];
				if updates.len() % 3 != 0 || updates.len() > STICKER_COUNT * 3 {
					Err(format!("bad data length: {}", updates.len()))?;
				}
				let mut data = self.read_by_password(password.to_owned()).await?;
				for chunk in updates.chunks(3) {
					let [sticker_lo, sticker_hi, delta] = chunk else {
						panic!("wtf")
					};
					let sticker = usize::from(u16::from_le_bytes([*sticker_lo, *sticker_hi]));
					if sticker >= STICKER_COUNT {
						Err(format!("bad sticker ID: {sticker}"))?;
					}
					let delta: i8 = delta.cast_signed();
					let new_value = i32::from(delta) + i32::from(data[sticker]);
					if new_value < 0 {
						data[sticker] = 0;
					} else if new_value > 254 {
						Err(format!("invalid data byte: {new_value}"))?;
					} else {
						data[sticker] = new_value.clamp(0, 99) as u8;
					}
				}
				let data = self.write(password.to_owned(), data).await?;
				write_ok_with_data(stream, &data).await?;
			}
			b'W' => {
				// write (fixed)
				let sep = body
					.iter()
					.position(|&c| c == 0x01)
					.ok_or("bad format for w command")?;
				let password = std::str::from_utf8(&body[1..sep])
					.map_err(|_| "password contains invalid UTF-8")?;
				let updates = &body[sep + 1..];
				if updates.len() % 3 != 0 || updates.len() > STICKER_COUNT * 3 {
					Err(format!("bad data length: {}", updates.len()))?;
				}
				let mut data = self.read_by_password(password.to_owned()).await?;
				for chunk in updates.chunks(3) {
					let [sticker_lo, sticker_hi, delta] = chunk else {
						panic!("wtf")
					};
					let sticker =
						usize::from(u16::from(*sticker_lo) + u16::from(*sticker_hi) * 0x40);
					if sticker >= STICKER_COUNT {
						Err(format!("bad sticker ID: {sticker}"))?;
					}
					let delta: i8 = delta.cast_signed();
					let new_value = i32::from(delta) + i32::from(data[sticker]);
					if new_value < 0 {
						data[sticker] = 0;
					} else if new_value > 254 {
						Err(format!("invalid data byte: {new_value}"))?;
					} else {
						data[sticker] = new_value.clamp(0, 99) as u8;
					}
				}
				let data = self.write(password.to_owned(), data).await?;
				write_ok_with_data(stream, &data).await?;
			}
			_ => {
				Err("bad format")?;
			}
		}
		Ok(())
	}
	async fn handle_connection(&self, addr: SocketAddr, stream: &mut tokio::net::TcpStream) {
		let mut is_err = false;
		match self.try_handle_connection(stream).await {
			Ok(()) => {}
			Err(e) => {
				eprintln!("Error handling connection to {addr}: {e}");
				is_err = true;
			}
		}
		if is_err {
			// This has to be down here because rust is a bit stupid
			_ = stream.write_all(BAD_REQUEST).await;
		}
	}
	async fn run(&'static self) {
		let port = 51822;
		let host_addr = SocketAddr::from(([127, 0, 0, 1], port));
		let listener = match tokio::net::TcpListener::bind(host_addr).await {
			Ok(l) => l,
			Err(e) => {
				eprintln!("Couldn't bind to localhost:{port}: {e}");
				return;
			}
		};
		loop {
			let (mut stream, addr) = match listener.accept().await {
				Ok(result) => result,
				Err(e) => {
					eprintln!("Error accepting connection: {e}");
					continue;
				}
			};
			println!("Accepted connection from {addr}");
			tokio::task::spawn(async move {
				_ = tokio::time::timeout(
					REQUEST_TIMEOUT,
					self.handle_connection(addr, &mut stream),
				)
				.await;
				_ = stream.shutdown().await;
			});
		}
	}
}

async fn try_main() -> Result<(), Box<dyn Error>> {
	let db = sqlite::Connection::open("database.sq3").await?;
	db.call(|conn| {
		conn.execute(
			"CREATE TABLE IF NOT EXISTS users (password TEXT UNIQUE, publicId TEXT UNIQUE, data BLOB)",
			[],
		)
	})
	.await?;
	let server = Box::leak(Box::new(Server { db }));
	server.run().await;
	Ok(())
}

#[tokio::main]
async fn main() -> ExitCode {
	if let Err(e) = try_main().await {
		eprintln!("{e}");
		ExitCode::FAILURE
	} else {
		ExitCode::SUCCESS
	}
}
